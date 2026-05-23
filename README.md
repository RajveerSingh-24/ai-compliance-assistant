# 🛡️ AI Compliance & Policy Assistant
### Enterprise RAG-Based Document Intelligence System

> An enterprise-grade, full-stack AI application for intelligent compliance document analysis — featuring semantic search, real-time streaming, interactive PDF citations, and a premium SaaS UI.

---

## 📸 Overview

The **AI Compliance & Policy Assistant** is a production-style **Retrieval-Augmented Generation (RAG)** system. Users upload compliance PDFs (e.g., OSHA guidelines, HR handbooks), and the system:

- Extracts and chunks text **page-by-page**
- Embeds chunks into a **ChromaDB vector database**
- Answers natural-language queries using a **local Llama 3 LLM via Ollama**
- Streams responses **word-by-word** with granular, page-accurate **source citations**
- Displays a slide-out **interactive PDF drawer** deep-linked to the cited page

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React, Tailwind CSS v4 |
| **Backend** | FastAPI, Python, Uvicorn |
| **AI / Embeddings** | Sentence-Transformers (`all-MiniLM-L6-v2`) |
| **Vector DB** | ChromaDB (Persistent) |
| **LLM Engine** | Llama 3 via Ollama (local, private) |
| **PDF Parsing** | PyMuPDF (`fitz`) |
| **Streaming** | Server-Sent Events (SSE) |

---

## ✨ Features

- 📄 **Multi-PDF Upload** — drag-and-drop or click to upload compliance PDFs
- 🔍 **Semantic Search** — cosine-similarity vector search across all documents
- 💬 **Word-by-Word Streaming** — ChatGPT-style SSE real-time response rendering
- 📑 **Granular Citation Cards** — exact text excerpts + page numbers + relevance scores
- 🗂️ **Interactive PDF Drawer** — slide-out side panel that deep-links to the cited page
- 🕐 **Multi-Session Chat History** — persistent sessions stored in `localStorage`
- 🗑️ **Document Deletion** — purges vectors from ChromaDB and raw file from disk
- 🌙 **Dark / Light Mode** — full theme toggle support
- 👤 **User Profile Bar** — ChatGPT-style user card pinned at the bottom of the sidebar

---

## 📁 Project Structure

```
ai-compliance-assistant/
├── backend/                    # FastAPI Python backend
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat.py         # /chat and /chat/stream SSE endpoints
│   │   │   └── upload.py       # /upload/pdf, /upload/files, DELETE endpoints
│   │   ├── data/
│   │   │   ├── documents/      # Uploaded PDFs stored here
│   │   │   └── chroma_db/      # Persistent ChromaDB vector store
│   │   ├── llm/
│   │   │   └── ollama_client.py # Ollama Llama 3 integration
│   │   ├── services/
│   │   │   ├── chunker.py      # Text chunking logic
│   │   │   ├── embeddings.py   # Sentence-Transformer encoder
│   │   │   ├── pdf_loader.py   # PyMuPDF page-by-page extractor
│   │   │   ├── rag.py          # RAG pipeline (search + prompt assembly)
│   │   │   └── vector_store.py # ChromaDB client + store/search functions
│   │   └── main.py             # FastAPI app entry point + startup logic
│   ├── requirements.txt
│   └── venv/                   # Python virtual environment (gitignored)
│
├── frontend/                   # Next.js 15 frontend
│   ├── app/
│   │   ├── globals.css         # Global styles + Tailwind v4 config
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Main application page (all UI logic)
│   ├── lib/
│   │   └── api.ts              # Axios API helpers
│   ├── public/                 # Static assets
│   ├── package.json
│   └── .gitignore
│
├── PROJECT_EXPLANATION.md      # In-depth technical documentation (viva/interviews)
└── README.md                   # This file
```

---

## 🚀 Getting Started

### Prerequisites

Ensure the following are installed on your machine:

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **Ollama** — [Download here](https://ollama.com)

---

### 1. Pull the Llama 3 Model

```bash
ollama pull llama3
```

Verify it is running:
```bash
ollama serve     # or open the Ollama desktop app
curl http://localhost:11434/api/generate -d '{"model":"llama3","prompt":"hi","stream":false}'
```

---

### 2. Start the FastAPI Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

✅ Backend will be live at: **http://localhost:8000**  
📖 Interactive API docs at: **http://localhost:8000/docs**

> On first startup, the backend automatically downloads and indexes the official **28-page OSHA 3021 PDF** with accurate page-number metadata.

---

### 3. Start the Next.js Frontend

```bash
cd frontend
npm install
npm run dev
```

✅ Frontend will be live at: **http://localhost:3000**

---

### Quick Verification Checklist

| Service | URL | Expected Response |
|---------|-----|-------------------|
| Frontend | http://localhost:3000 | Dashboard loads |
| Backend | http://localhost:8000 | `{"message":"RAG System Running"}` |
| LLM | http://localhost:11434 | Ollama running indicator |

---

## 🔄 How It Works (RAG Pipeline)

```
PDF Upload → Page-by-Page Extraction → Text Chunking → Embedding → ChromaDB
                                                                        │
User Query → Query Embedding → Cosine Similarity Search → Top-K Chunks ┘
                                                               │
                                    Prompt Assembly → Llama 3 → SSE Stream → UI
```

1. **Ingestion**: PDFs are parsed with PyMuPDF, split into overlapping chunks per page, embedded with `all-MiniLM-L6-v2`, and stored in ChromaDB with `{source, page}` metadata.
2. **Retrieval**: User queries are embedded and compared via cosine similarity — top matching chunks are retrieved.
3. **Generation**: Retrieved chunks are assembled into a strict system prompt. Llama 3 generates a cited answer streamed token-by-token via SSE.
4. **Citation**: The frontend renders expandable cards showing the exact excerpt, page number, and relevance score — clicking opens the PDF at that page.

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload/pdf` | Upload and index a PDF |
| `GET` | `/upload/files` | List all indexed documents |
| `DELETE` | `/upload/pdf/{filename}` | Remove document + purge vectors |
| `POST` | `/chat/` | One-shot RAG query |
| `POST` | `/chat/stream` | Streaming SSE RAG query |
| `GET` | `/documents/{filename}` | Serve PDF for the viewer |

---

## 📚 Documentation

For a comprehensive technical deep-dive including NLP concepts, viva preparation, and interview explanations, see:

👉 **[PROJECT_EXPLANATION.md](./PROJECT_EXPLANATION.md)**

---

## 🔮 Future Roadmap

- [ ] OCR support for scanned/image PDFs
- [ ] Role-Based Access Control (RBAC)
- [ ] Multi-language document support
- [ ] Cloud deployment (AWS / GCP / Railway)
- [ ] Analytics dashboard for query trends
- [ ] Fine-tuned compliance-specific models

---

## 👤 Author

**Rajveer Singh**  
Built as an enterprise-grade AI portfolio project demonstrating full-stack RAG architecture
