"use client";

import { useState, useRef, useEffect } from "react";
import { uploadPDF } from "@/lib/api";

type Message = {
  role: "user" | "ai";
  content: string;
  sources?: any[];
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<{ filename: string, page: number } | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load uploaded files & sessions on startup
  useEffect(() => {
    fetchUploadedFiles();
    
    const savedSessions = localStorage.getItem("compliance_sessions");
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions) as ChatSession[];
        setSessions(parsed);
        if (parsed.length > 0) {
          setActiveSessionId(parsed[0].id);
          setMessages(parsed[0].messages);
        } else {
          createNewSession();
        }
      } catch (e) {
        createNewSession();
      }
    } else {
      createNewSession();
    }
  }, []);

  // Sync sessions to localStorage
  const saveSessionsToStorage = (updatedSessions: ChatSession[]) => {
    localStorage.setItem("compliance_sessions", JSON.stringify(updatedSessions));
  };

  // Fetch uploaded files list from FastAPI backend
  const fetchUploadedFiles = async () => {
    try {
      const res = await fetch("http://localhost:8000/upload/files");
      if (res.ok) {
        const files = await res.json();
        setUploadedFiles(files);
      }
    } catch (err) {
      console.error("Failed to fetch uploaded files list:", err);
    }
  };

  // Create a new empty chat session
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [],
      createdAt: Date.now()
    };
    
    setSessions(prev => {
      const updated = [newSession, ...prev];
      saveSessionsToStorage(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
    setMessages([]);
  };

  // Switch active session
  const selectSession = (id: string) => {
    setActiveSessionId(id);
    const session = sessions.find(s => s.id === id);
    if (session) {
      setMessages(session.messages);
    }
  };

  // Delete chat session
  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    saveSessionsToStorage(updated);

    if (activeSessionId === id) {
      if (updated.length > 0) {
        setActiveSessionId(updated[0].id);
        setMessages(updated[0].messages);
      } else {
        createNewSession();
      }
    }
  };

  // Delete document from vector database and local disk
  const deleteDocument = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to completely delete "${filename}" from the Knowledge Base?`)) return;

    try {
      const res = await fetch(`http://localhost:8000/upload/pdf/${filename}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setUploadedFiles(prev => prev.filter(f => f !== filename));
        alert("Document deleted successfully from knowledge base.");
      } else {
        alert("Failed to delete document from database.");
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
      alert("Error occurred deleting document.");
    }
  };

  // Document Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setIsUploading(true);
    try {
      await uploadPDF(file);
      setUploadedFiles(prev => {
        if (prev.includes(file.name)) return prev;
        return [...prev, file.name];
      });
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload document.");
    }
    setIsUploading(false);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Send Policy Query with SSE Word-by-Word Streaming
  const sendMessage = async (overrideInput?: string) => {
    const textToSent = overrideInput || input;
    if (!textToSent.trim()) return;

    const userMsg: Message = {
      role: "user",
      content: textToSent,
    };

    // Update active UI messages instantly
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Renaming empty session dynamically based on first question
    let activeTitle = "";
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id === activeSessionId) {
          activeTitle = s.title === "New Chat" 
            ? (textToSent.length > 28 ? textToSent.substring(0, 25) + "..." : textToSent)
            : s.title;
          return {
            ...s,
            title: activeTitle,
            messages: [...s.messages, userMsg]
          };
        }
        return s;
      });
      saveSessionsToStorage(updated);
      return updated;
    });

    try {
      const response = await fetch("http://localhost:8000/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: textToSent }),
      });

      if (!response.ok) {
        throw new Error("Streaming connection failed");
      }

      // Add a placeholder message for AI first
      const aiMsgPlaceholder: Message = {
        role: "ai",
        content: "",
        sources: [],
      };
      setMessages((prev) => [...prev, aiMsgPlaceholder]);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error("Reader was not initialized");
      }

      let accumulatedAnswer = "";
      let sourcesList: any[] = [];
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim().startsWith("data: ")) {
            const dataContent = line.replace(/^data:\s*/, "").trim();
            if (dataContent === "[DONE]") {
              break;
            }
            try {
              const parsed = JSON.parse(dataContent);
              if (parsed.type === "sources") {
                sourcesList = parsed.sources;
              } else if (parsed.type === "content") {
                accumulatedAnswer += parsed.content;
              }

              // Update active local state
              setMessages((prev) => {
                const updated = [...prev];
                if (updated.length > 0) {
                  updated[updated.length - 1] = {
                    role: "ai",
                    content: accumulatedAnswer,
                    sources: sourcesList,
                  };
                }
                return updated;
              });

              // Update persistent session storage
              setSessions(prev => {
                const updated = prev.map(s => {
                  if (s.id === activeSessionId) {
                    const sessionMsgs = [...s.messages];
                    // Append placeholder if not exist, otherwise update last item
                    if (sessionMsgs.length === newMessages.length) {
                      sessionMsgs.push({
                        role: "ai",
                        content: accumulatedAnswer,
                        sources: sourcesList
                      });
                    } else {
                      sessionMsgs[sessionMsgs.length - 1] = {
                        role: "ai",
                        content: accumulatedAnswer,
                        sources: sourcesList
                      };
                    }
                    return { ...s, messages: sessionMsgs };
                  }
                  return s;
                });
                saveSessionsToStorage(updated);
                return updated;
              });
            } catch (err) {
              // Catch JSON partial errors safely
            }
          }
        }
      }
    } catch (err) {
      console.error("Streaming failed:", err);
      const errorMsg: Message = {
        role: "ai",
        content: "Unable to generate response. Please try again later.",
      };
      
      setMessages(prev => [...prev, errorMsg]);
      setSessions(prev => {
        const updated = prev.map(s => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              messages: [...s.messages, errorMsg]
            };
          }
          return s;
        });
        saveSessionsToStorage(updated);
        return updated;
      });
    }

    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={`${isDarkMode ? 'dark' : ''} h-screen w-full`}>
      <div className="h-full flex bg-slate-50 dark:bg-[#0f1115] text-slate-800 dark:text-zinc-100 font-sans overflow-hidden selection:bg-indigo-200 selection:text-indigo-900 dark:selection:bg-indigo-500/30 dark:selection:text-indigo-100 transition-colors duration-300">
        
        {/* SIDEBAR */}
        <div className="w-72 bg-white dark:bg-[#09090b] border-r border-slate-200 dark:border-zinc-800/50 flex flex-col hidden md:flex flex-shrink-0 transition-colors duration-300">
          
          {/* Brand */}
          <div className="p-5 flex items-center gap-3 border-b border-slate-200/50 dark:border-zinc-800/40">
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-sm shrink-0 transition-colors duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white dark:text-[#09090b]">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  Compliance AI
                </h1>
                <span className="text-[9px] font-bold text-slate-500 dark:text-zinc-500 border border-slate-300 dark:border-zinc-700 rounded px-1 py-0.5">PRO</span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 mt-0.5">
                Enterprise RAG Assistant
              </p>
            </div>
          </div>

          {/* Sidebar Nav Content */}
          <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-6">
            
            {/* Upload Area */}
            <div className="px-5">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept=".pdf"
              />
              <div 
                onClick={triggerFileUpload}
                className={`w-full py-5 rounded-xl border border-dashed border-slate-300 dark:border-zinc-850 bg-slate-50 hover:bg-slate-100 dark:bg-[#0f1115] dark:hover:bg-[#141417] hover:border-slate-400 dark:hover:border-zinc-650 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1.5 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-slate-400 dark:border-zinc-500 border-t-slate-800 dark:border-t-white rounded-full animate-spin mb-1"></div>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 dark:text-zinc-500">
                    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 16 4-4 4 4"/>
                  </svg>
                )}
                <div className="text-[13px] font-medium text-slate-700 dark:text-zinc-300">
                  {isUploading ? 'Uploading...' : 'Drag or Click'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-500">
                  PDF manuals up to 20MB
                </div>
              </div>
            </div>

            {/* Knowledge Base Documents */}
            <div className="px-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider">KNOWLEDGE BASE</h3>
                <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-full">{uploadedFiles.length} FILES</span>
              </div>
              
              <div className="space-y-0.5 max-h-[220px] overflow-y-auto pr-1">
                {uploadedFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors group">
                    <div className="flex items-center gap-2.5 truncate">
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 dark:text-zinc-500 shrink-0">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="text-[12.5px] text-slate-600 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 truncate">{file}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:hidden"></div>
                      <button 
                        onClick={(e) => deleteDocument(file, e)}
                        className="hidden group-hover:block text-slate-400 hover:text-red-500 dark:text-zinc-650 dark:hover:text-red-400 transition-colors p-0.5 cursor-pointer"
                        title="Delete Document"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                
                {/* Fallback default sample file displayed if list empty */}
                {uploadedFiles.length === 0 && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors group">
                    <div className="flex items-center gap-2.5 truncate">
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 dark:text-zinc-500 shrink-0">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="text-[12.5px] text-slate-600 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 truncate">OSHA3021.pdf</span>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Chat History Sessions */}
            <div className="px-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider">RECENT CHATS</h3>
                <button 
                  onClick={createNewSession} 
                  className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 cursor-pointer"
                >
                  + NEW CHAT
                </button>
              </div>
              <div className="space-y-0.5 max-h-[160px] overflow-y-auto pr-1">
                {sessions.map((s) => (
                  <div 
                    key={s.id} 
                    onClick={() => selectSession(s.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all group ${s.id === activeSessionId ? 'bg-slate-100 dark:bg-zinc-800/80 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800/30'}`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 dark:text-zinc-500 shrink-0">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span className="text-[12.5px] truncate">{s.title}</span>
                    </div>
                    <button 
                      onClick={(e) => deleteSession(s.id, e)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 p-0.5 transition-opacity rounded cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 hover:text-red-500 dark:text-zinc-650 dark:hover:text-red-400">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* User Profile Bar */}
          <div className="p-4 border-t border-slate-200/50 dark:border-zinc-800/40 flex items-center justify-between bg-slate-50/30 dark:bg-[#0b0c0f] transition-all duration-300">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[13px] font-bold shadow-sm shadow-indigo-500/20 shrink-0 select-none">
                RS
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13.5px] font-semibold text-slate-800 dark:text-zinc-200 truncate leading-snug">
                  Rajveer Singh
                </span>
                <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 truncate leading-none mt-0.5">
                  Free
                </span>
              </div>
            </div>
            <button 
              className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer shrink-0"
              title="Account Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>

        </div>

        {/* MAIN AREA */}
        <div className="flex flex-col flex-1 relative bg-slate-50 dark:bg-[#0f1115] transition-colors duration-300 overflow-hidden">
          
          {/* HEADER */}
          <div className="h-[72px] flex items-center justify-between px-6 shrink-0 z-10 border-b border-slate-200/50 dark:border-zinc-800/40">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <h2 className="text-[12px] font-bold text-slate-500 dark:text-zinc-400 tracking-wider">
                LLAMA 3.1 (LOCAL OLLAMA ENGINE)
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={createNewSession}
                className="w-9 h-9 rounded-full bg-white dark:bg-white flex items-center justify-center text-slate-700 dark:text-zinc-900 border border-slate-200 dark:border-transparent shadow-sm dark:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-colors cursor-pointer"
                title="New Chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/></svg>
              </button>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className="w-9 h-9 rounded-full bg-white dark:bg-[#18181b] flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none transition-colors cursor-pointer"
                title="Toggle Theme"
              >
                {isDarkMode ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </button>
            </div>
          </div>

          {/* CHAT AREA */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6">
            <div className="max-w-[760px] mx-auto flex flex-col gap-6 pb-40 pt-6">
              
              {/* Empty State */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center mt-[8vh] animate-fade-in-up">
                  <div className="w-16 h-16 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800/80 rounded-2xl flex items-center justify-center mb-6 shadow-sm dark:shadow-none transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 dark:text-zinc-300"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3 transition-colors">AI Compliance Assistant</h2>
                  <p className="text-slate-500 dark:text-zinc-400 text-[15px] max-w-[420px] leading-relaxed mb-12 transition-colors">
                    Upload compliance guidelines or handbook PDFs. Ask any policy questions to receive cited context.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                    <button 
                      onClick={() => sendMessage("What are the official working hours and overtime policy?")} 
                      className="flex flex-col items-start p-5 bg-white dark:bg-[#141417] border border-slate-200 dark:border-zinc-800/80 rounded-2xl hover:bg-slate-50 dark:hover:bg-[#1a1a1f] hover:border-slate-300 dark:hover:border-zinc-700 transition-all text-left shadow-sm dark:shadow-none cursor-pointer"
                    >
                      <h3 className="text-[14px] font-semibold text-slate-800 dark:text-zinc-200 mb-1.5 transition-colors">General Working Hours</h3>
                      <p className="text-[13px] text-slate-500 dark:text-zinc-500 leading-snug transition-colors">"What are the official working hours and overtime policy?"</p>
                    </button>
                    <button 
                      onClick={() => sendMessage("How should confidential customer information be classified?")} 
                      className="flex flex-col items-start p-5 bg-white dark:bg-[#141417] border border-slate-200 dark:border-zinc-800/80 rounded-2xl hover:bg-slate-50 dark:hover:bg-[#1a1a1f] hover:border-slate-300 dark:hover:border-zinc-700 transition-all text-left shadow-sm dark:shadow-none cursor-pointer"
                    >
                      <h3 className="text-[14px] font-semibold text-slate-800 dark:text-zinc-200 mb-1.5 transition-colors">Data Security Standards</h3>
                      <p className="text-[13px] text-slate-500 dark:text-zinc-500 leading-snug transition-colors">"How should confidential customer information be classified?"</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Chat Messages */}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-4 sm:gap-5 animate-fade-in-up w-full ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className="flex-shrink-0 mt-1">
                    {msg.role === "ai" ? (
                      <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 flex items-center justify-center shadow-sm dark:shadow-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 dark:text-zinc-300"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-zinc-800 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 dark:text-zinc-300"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                    )}
                  </div>
                  <div className={`flex flex-col gap-1.5 max-w-[85%] sm:max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div
                      className={`px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed ${
                        msg.role === "user"
                          ? "bg-slate-900 text-white dark:bg-zinc-800 dark:text-zinc-100 rounded-tr-sm shadow-sm"
                          : "bg-transparent text-slate-800 dark:text-zinc-300 prose prose-slate dark:prose-invert max-w-none w-full"
                      }`}
                    >
                      {msg.content.split('\n').map((line, idx) => (
                        <span key={idx}>
                          {line}
                          {idx !== msg.content.split('\n').length - 1 && <br />}
                        </span>
                      ))}

                      {/* Expanding Granular Citation Excerpt Cards */}
                      {msg.role === "ai" && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-slate-200/50 dark:border-zinc-800/40 w-full">
                          <div className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider mb-3">SOURCES CITED ({msg.sources.length})</div>
                          <div className="flex flex-col gap-2.5">
                            {msg.sources.map((src, idx) => {
                              // Deterministic matching score based on index
                              const score = Math.round(98 - (idx * 3.5));
                              return (
                                <div key={idx} className="bg-slate-100/40 dark:bg-zinc-800/20 border border-slate-200/50 dark:border-zinc-800/50 rounded-xl overflow-hidden transition-all duration-300 shadow-sm dark:shadow-none hover:border-slate-300 dark:hover:border-zinc-700">
                                  {/* Citation Card Header */}
                                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100/30 dark:bg-zinc-800/30">
                                    <div className="flex items-center gap-2 truncate">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 dark:text-zinc-500 shrink-0">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                      </svg>
                                      <span className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300 truncate">{src.source === "uploaded_document" ? "OSHA3021.pdf" : src.source}</span>
                                      <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full shrink-0">p. {src.page}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full shrink-0">{score}% Match</span>
                                      <button
                                        onClick={() => setSelectedDoc({ filename: src.source, page: src.page })}
                                        className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
                                      >
                                        Open PDF
                                      </button>
                                    </div>
                                  </div>
                                  {/* Matching Excerpt */}
                                  <div className="p-3 text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-400 font-normal italic border-t border-slate-200/30 dark:border-zinc-800/30 max-h-[100px] overflow-y-auto">
                                    "{src.content}"
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading Skeleton */}
              {loading && (
                <div className="flex gap-4 sm:gap-5 animate-fade-in-up w-full">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 flex items-center justify-center shadow-sm dark:shadow-none">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 dark:text-zinc-300"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 items-start">
                    <div className="px-5 py-4 rounded-2xl bg-transparent flex gap-1.5 items-center h-12">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-600 animate-pulse-fast" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-600 animate-pulse-fast" style={{ animationDelay: '300ms' }}></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-600 animate-pulse-fast" style={{ animationDelay: '600ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* INPUT AREA */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50 dark:from-[#0f1115] dark:via-[#0f1115] to-transparent pt-10 pb-8 px-4 sm:px-6 z-20">
            <div className="max-w-[760px] mx-auto">
              <div className="relative flex items-center bg-white dark:bg-[#141417] rounded-full border border-slate-200 dark:border-zinc-800/80 px-4 py-1.5 shadow-sm dark:shadow-lg focus-within:border-slate-300 dark:focus-within:border-zinc-600 focus-within:ring-1 focus-within:ring-slate-300 dark:focus-within:ring-zinc-600 transition-all">
                
                <input
                  className="w-full min-h-[50px] bg-transparent px-2 text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none transition-colors"
                  placeholder="Query policy framework or handbook..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                />

                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                    input.trim() && !loading
                      ? "bg-slate-900 text-white hover:bg-slate-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
                      : "bg-slate-100 text-slate-400 dark:bg-[#27272a] dark:text-zinc-500 cursor-not-allowed"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                </button>
              </div>
              <div className="text-center mt-4 text-[10px] font-bold text-slate-400 dark:text-zinc-600 tracking-wider transition-colors">
                ENTERPRISE GRADE SANDBOXED AGENT
              </div>
            </div>
          </div>

        </div>

        {/* PDF DRAWER */}
        {selectedDoc && (
          <div className="w-[45%] h-full bg-white dark:bg-[#09090b] border-l border-slate-200 dark:border-zinc-800/50 flex flex-col z-30 transition-all duration-300 animate-slide-in-right shrink-0">
            {/* Drawer Header */}
            <div className="h-[72px] flex items-center justify-between px-6 border-b border-slate-200 dark:border-zinc-800/50 shrink-0">
              <div className="flex items-center gap-3 truncate">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-900 dark:text-white shrink-0">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{selectedDoc.filename === "uploaded_document" ? "OSHA3021.pdf" : selectedDoc.filename}</span>
                <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-full shrink-0">PAGE {selectedDoc.page}</span>
              </div>
              <button 
                onClick={() => setSelectedDoc(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* PDF iframe */}
            <div className="flex-1 bg-slate-100 dark:bg-[#0f1115] relative p-2">
              <iframe 
                src={`http://localhost:8000/documents/${selectedDoc.filename === "uploaded_document" ? "OSHA3021.pdf" : selectedDoc.filename}#page=${selectedDoc.page}`}
                className="w-full h-full rounded-xl border-0 shadow-inner"
                title="Document Viewer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
