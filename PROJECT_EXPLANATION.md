# AI Compliance & Policy Assistant
### RAG-Based Enterprise Document Intelligence System

---

## 1. Project Overview

### What this project is
The **AI Compliance & Policy Assistant** is an enterprise-grade, high-fidelity **Retrieval-Augmented Generation (RAG)** application. It is designed to act as an intelligent document workstation that automates the ingestion, analysis, semantic retrieval, and contextual explanation of dense corporate compliance guidelines, employee handbooks, and regulatory manuals (such as OSHA guidelines). The system allows users to upload PDF documents, automatically indices their contents, and enables a conversational AI interface where users can ask complex policy questions and receive streaming, word-by-word answers cited directly from specific pages of the uploaded documents.

```
┌─────────────────┐      Ingest      ┌──────────────────────┐      Query      ┌───────────────┐
│  Uploaded PDF   │ ───────────────> │  Chroma Vector DB    │ <────────────── │  User Query   │
└─────────────────┘                  └──────────────────────┘                 └───────────────┘
         │                                       │                                    │
         ▼                                       ▼                                    ▼
┌─────────────────┐                 ┌──────────────────────┐                 ┌───────────────┐
│ Page Extraction │                 │  Semantic Retrieval  │ ───────────────> │  Llama 3.1    │
└─────────────────┘                 └──────────────────────┘                 └───────────────┘
                                                                                      │
                                                                                      ▼
                                                                             ┌────────────────┐
                                                                             │ Cited Stream   │
                                                                             └────────────────┘
```

### Real-world problem it solves
In modern enterprises, compliance officers, HR specialists, and legal counsels spend countless hours manually searching through hundreds of pages of legal, financial, and operational guidelines to answer simple policy questions. The manual lookup is slow, highly prone to human error, and introduces serious regulatory risks. This system transforms this static research workflow into an automated, interactive chat experience, reducing compliance lookups from hours to seconds while maintaining auditability via precise citations.

### Why AI + NLP is useful here
Standard keyword searches (like `Cmd + F`) fail when users search using different wording than what is written in the documents (e.g., searching for *"daily shift limits"* when the document says *"standard operational hours"*). Natural Language Processing (NLP) models address this by capturing the **semantic meaning** of queries, matching them against the conceptual intent of the text, and using Large Language Models (LLMs) to synthesize coherent, human-like answers rather than just presenting raw, unformatted paragraphs.

### Why this is an industry-level SaaS-style project
This application goes far beyond a simple "toy" chatbot. It implements advanced enterprise design patterns:
*   **True Word-by-Word Chat Streaming** via Server-Sent Events (SSE) for a highly responsive, premium feel.
*   **A Gorgeous, Persistent SaaS UI** utilizing a tailwind-backed sidebar, responsive dark mode, drag-and-drop zones, and slide-out side-by-side interactive PDF drawers.
*   **Granular Citation Cards** displaying matching text snippets, similarity confidence scores, and deep-link page snapping.
*   **Robust Multi-Session Management** powered by local storage persistence.
*   **Vector Purging** allowing instant deletion of records from the Chroma vector database and the physical disk.

---

## 2. Objective of the Project

The core objectives of the system are:
*   **Enterprise Document Intelligence**: Ingesting unstructured data (PDFs) and converting it into structured, indexable knowledge.
*   **Semantic Search over Documents**: Matching queries against mathematical representations of text chunks to identify concepts rather than exact matching strings.
*   **Strict RAG Pipeline Control**: Eliminating LLM hallucinations by forcing the model to answer *only* using retrieved document contexts.
*   **Auditable Conversational Interface**: Providing exact page-number citations and raw source excerpts so that compliance claims can be instantly verified.

---

## 3. Complete Tech Stack

The architecture is built on a highly modular, decoupled **three-tier architecture** designed for sub-second query latency and maximum code maintainability:

### Frontend
*   **React & Next.js 15 (App Router)**: Handled routing, server-side rendering support, and real-time state management. Chosen for its performance, production-ready framework features, and fast compilation.
*   **Tailwind CSS v4**: Provided utility-first styling with high-performance CSS compilation, custom transitions, responsive layout configurations, and a gorgeous modern glassmorphic look.

### Backend
*   **FastAPI (Python)**: Utilized as the high-performance asynchronous API gateway. Its native support for async concurrency, automatic Pydantic data validation, and minimal overhead makes it highly suitable for streaming RAG pipelines.
*   **Uvicorn**: Used as the lightning-fast ASGI web server implementation for Python.

### AI / NLP & Vector Stack
*   **Sentence-Transformers (`all-MiniLM-L6-v2`)**: Used to convert text chunks into dense 384-dimensional vector representations. It is extremely fast, has a small memory footprint, and provides excellent semantic mapping.
*   **ChromaDB**: Utilized as the persistent, lightweight vector database. It supports instant metadata filtering (crucial for targeted document deletion) and features extremely fast query similarity searches.
*   **Local LLM Engine (Llama 3.1 via Ollama)**: Served as our core generative model. Running locally guarantees total data privacy—an absolute requirement for enterprise compliance data—while delivering high-reasoning summaries.
*   **PyMuPDF (`fitz`)**: Employed as the ultra-fast PDF parser to extract both text layouts and page dimensions page-by-page.

---

## 4. Full System Workflow

The architecture operates on an end-to-end multi-stage pipeline, mimicking production-ready architectures:

```
[PDF Ingestion] ────> [Page Parsing] ────> [Text Chunking] ────> [Embedding Engine] ────> [ChromaDB]
                                                                                            │
[User Query] ────────> [Embedding Engine] ──> [Cosine Search] ──> [Context Assembly] ───────┘
                                                                       │
[User Stream] <─────── [SSE Stream Output] <─── [Llama 3.1 Engine] <───┘
```

### Ingestion & Vectorization Flow
1.  **PDF Upload**: The user drags/drops a document. The Next.js frontend sends a multipart form request to the `/upload/pdf` backend API.
2.  **Raw File Persistence**: The backend saves the raw PDF to the `app/data/documents` directory to allow the frontend drawer to render it directly.
3.  **Page-by-Page Extraction**: PyMuPDF parses the file, preserving exact 1-indexed page boundaries to record exactly where each text block resides.
4.  **Text Preprocessing & Chunking**: The raw text of each page is split into overlapping chunks of a set token/character length. Overlapping ensures concepts spanning across boundaries are not cut in half.
5.  **Dense Embedding Generation**: Each text chunk is passed through the `all-MiniLM-L6-v2` encoder model, generating a high-density numerical vector.
6.  **Chroma DB Storage**: The vector embeddings, text segments, and structural metadata (`{"source": filename, "page": page_num}`) are written to ChromaDB under a unique chunk ID.

### Inference & Generation Flow (RAG)
7.  **User Query Ingestion**: The user submits a query (e.g., *"What is the standard working hours?"*).
8.  **Query Vectorization**: The backend converts the search query into the same 384-dimensional embedding using the exact same Sentence-Transformer model.
9.  **Similarity Search**: ChromaDB compares the query vector against the stored document vectors using **Cosine Similarity**, retrieving the top $K$ most semantically relevant chunks.
10. **Prompt Synthesis**: The retrieved chunks are assembled into a structured system prompt:
    ```markdown
    You are an AI Compliance Assistant.
    Answer ONLY using the context below. If the answer is not in the context, say "Not found".
    
    Context:
    [Retrieved Chunk 1 - OSHA3021.pdf Page 5]
    [Retrieved Chunk 2 - OSHA3021.pdf Page 8]
    
    Question: {query}
    ```
11. **Local LLM Execution**: The prompt is fed into Llama 3.1.
12. **Server-Sent Events (SSE) Streaming**: Instead of waiting for the full response, the backend uses FastAPI's `StreamingResponse` to push text chunks to the client word-by-word in real-time.
13. **Frontend Rendering & Deep-Linking**: The React app reads the SSE buffer, parses JSON packets, and dynamically updates the message state while presenting clickable citations that open the PDF to the exact page.

---

## 5. NLP Concepts Used

*   **Vector Representation (Embeddings)**: The process of translating raw, unstructured text strings into multi-dimensional floating-point vectors. Words or paragraphs with similar conceptual meanings are mapped close to each other in this vector space.
*   **Cosine Similarity**: The metric used to compare two vectors. It measures the cosine of the angle between two multi-dimensional vectors, checking how closely their semantic content aligns:
    $$\text{similarity} = \cos(\theta) = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}$$
*   **Chunking (Overlapping Sliding Window)**: Breaking down a large document into manageable units. Without chunking, passing an entire book to an LLM would overflow its context window and dilute its retrieval accuracy.
*   **Retrieval-Augmented Generation (RAG)**: A pattern where external information is searched and injected into an LLM's prompt context before execution. This anchors the LLM, preventing it from making up answers (hallucinating).
*   **Prompt Engineering**: Structuring the inputs to an LLM so it acts predictably, behaves as a compliance assistant, and adheres strictly to a "no-hallucination" constraint.

---

## 6. Deep Learning & AI Models Used

### Embedding Model: `all-MiniLM-L6-v2`
A highly tuned MiniLM model trained on over 1 billion sentence pairs.
*   **Input**: Text segments (up to 256 tokens).
*   **Output**: 384-dimensional floating-point vector.
*   **Purpose**: Computes mathematical indices representing the text's conceptual meaning.

### Generative Model: Llama 3.1 (8B)
Meta's open-weights model, run locally via the Ollama engine.
*   **Reasoning Capability**: It excels at understanding structural context, synthesizing multiple source inputs, and adhering strictly to conditional system prompts.
*   **Generative vs. Retrieval**: The embedding search is the **Retrieval** component (finding relevant facts). Llama 3.1 is the **Generative** component (summarizing, rephrasing, and presenting the retrieved facts in smooth, conversational language).

---

## 7. System Architecture

```
                                  ┌───────────────────────────┐
                                  │      React Frontend       │
                                  │  (Next.js Client / SSE)   │
                                  └─────────────┬─────────────┘
                                                │
                                       REST / Stream Calls
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │    FastAPI API Gateway    │
                                  │   (Router / Upload / Chat)│
                                  └─────────────┬─────────────┘
                                                │
                       ┌────────────────────────┴────────────────────────┐
                       ▼                                                 ▼
        ┌───────────────────────────┐                     ┌───────────────────────────┐
        │     Local Ollama LLM      │                     │     ChromaDB Client       │
        │     (Llama 3.1 Engine)    │                     │  (Persistent Vector DB)   │
        └───────────────────────────┘                     └───────────────────────────┘
```

### Why this architecture is scalable:
*   **Decoupled Components**: The frontend and backend run as independent services. If traffic grows, we can scale multiple backend container replicas behind a load balancer without impacting the UI.
*   **Pluggable Vector Store**: ChromaDB can be swapped with a production cloud vector database (like Pinecone, Qdrant, or Milvus) with zero changes to the core React codebase.
*   **Local LLM Autonomy**: By utilizing Ollama locally, the system operates completely free of API usage limits, cost-per-token overheads, and network outages, making it highly secure and private.

---

## 8. Premium Features of the System

1.  **True Word-by-Word Chat Streaming**: Uses JS chunk buffer readers and Server-Sent Events to render responses instantly, avoiding loading spinners.
2.  **Interactive PDF Drawer (Side-by-Side View)**: Slide-out drawer renders pages directly inside a premium frame and snaps to the cited page.
3.  **Local Storage Persistence**: Reloads previous chat histories, remembers dark mode settings, and automatically titles new chats.
4.  **Granular Relevance Matching**: Displays emerald-colored badges indicating calculated similarity match percentages.
5.  **Self-Healing Default State**: Automatically downloads the official 28-page PDF regulatory document and indexes it page-by-page on startup.

---

## 9. Why This Project is Industry-Level

Most simple tutorials build "one-shot" QA bots that only look at a single string of text. This project replicates **real-world corporate applications** (like Harvey AI or Glean):
*   **Auditable Trust**: In compliance, you cannot trust an AI that says *"You get 1 hour lunch breaks"* without telling you exactly which policy handbook and page that rule is on. By returning exact page deep-links, this system is audit-ready.
*   **Regulatory Compliance Automation**: Large banks, healthcare providers, and industrial facilities must track changes in state and federal laws. This system allows compliance departments to simply upload new federal PDFs and instantly audit their operations.
*   **Scalable Deletion & Maintenance**: Includes data lifecycle APIs (`DELETE /upload/pdf/{filename}`) to remove data from vector databases, which is vital for GDPR compliance ("Right to be Forgotten").

---

## 10. Technical Challenges Faced & Solved

*   **The Page Alignment Problem**: Standard PDF text extractors strip formatting and dump text into a single string, losing page numbers.
    *   *Solution*: Extracted text page-by-page using PyMuPDF, chunked page-by-page, and appended structural page metadata to each database vector.
*   **SSE Stream Splitting**: Standard SSE stream chunks often deliver fractured JSON strings that crash standard `JSON.parse` commands.
    *   *Solution*: Implemented a resilient string chunk buffer on the Next.js frontend, splitting strictly on double-newlines (`\n\n`) and carrying over residual fragments.
*   **Default Citation Sync**: Initially, pre-indexed vectors lacked page numbers, causing random fallbacks.
    *   *Solution*: Developed an automated backend script to download, purge, and re-index the official 28-page document, syncing database and disk states.

---

## 11. Future Scope

*   **Optical Character Recognition (OCR)**: Integrating `Tesseract` or `EasyOCR` to support scanned image PDFs.
*   **Role-Based Access Control (RBAC)**: Restricting document access based on user security roles (e.g., HR can see payroll policies, general employees cannot).
*   **Analytics Dashboard**: Tracking common compliance search terms and document gaps.

---

## 12. Viva / Interview Explanations

### Short 1-Minute Pitch
> *"I built an AI-powered Compliance & Policy Assistant designed to solve the problem of manual regulatory lookup in enterprises. The application uses a Retrieval-Augmented Generation (RAG) architecture. Users upload policy PDFs, which are chunked, converted into dense vectors using Sentence-Transformers, and saved in a Chroma vector database. When a user asks a question, the system uses Cosine Similarity to find the most relevant chunks, feeds them as context to a local Llama 3.1 model, and streams a word-by-word cited answer. The frontend is built in Next.js and Tailwind, offering a modern side-by-side PDF drawer that deep-links directly to cited pages."*

### Medium 3-Minute Explanation
> *"My project is a full-stack document intelligence application focused on compliance lookup automation. On the frontend, I used Next.js and Tailwind to create a high-fidelity dashboard that supports dark mode, multi-session chat persistence, and an interactive side-by-side PDF drawer. 
> On the backend, I built an asynchronous FastAPI gateway in Python. The backend performs two core processes: Ingestion and Retrieval. 
> During Ingestion, uploaded PDFs are parsed page-by-page. We chunk the text and use the Sentence-Transformers `all-MiniLM-L6-v2` model to embed the text into 384-dimensional vectors, which are saved in ChromaDB alongside source and page metadata. 
> During Retrieval, the user's question is vectorized and matched against ChromaDB using cosine similarity. The system extracts the top matching text snippets, calculates their relevance scores, and builds a strict, context-locked prompt. 
> This prompt is sent to Llama 3.1 running locally. We stream the response in real-time using Server-Sent Events (SSE). The frontend reads the stream and renders granular citation cards. Clicking a card slides open the PDF viewer and scrolls the document directly to the cited page. This completely eliminates AI hallucinations and provides full auditability."*

### Detailed Technical Explanation
Refer to **Sections 3, 4, 5, and 6** of this document for a deep-dive walkthrough of structural mechanics, embedding mathematics, and vector search.

---

## 13. Important Keywords & Buzzwords

*   **RAG (Retrieval-Augmented Generation)**: Injected external knowledge to prevent LLM hallucinations.
*   **Vector Embedding**: Multi-dimensional mathematical vector representation of text semantics.
*   **Cosine Similarity**: Distance metric to match conceptual intent of user queries against text database.
*   **Metadata Filtering**: Crucial database filtering used to isolate and delete specific document records.
*   **SSE (Server-Sent Events)**: Asynchronous HTTP protocol for real-time word-by-word streaming.
*   **PyMuPDF / Fitz**: Extremely fast C-backed python library for PDF text layout analysis.
*   **Ollama Engine**: Local hosting framework used to host open-weights models privately.
*   **ChromaDB**: Lightweight, high-performance persistent vector database.
*   **Context Window**: The size limit of text inputs an LLM can process.
*   **Zero-Hallucination Prompting**: Constructing strict system guardrails to lock the model to source text.
