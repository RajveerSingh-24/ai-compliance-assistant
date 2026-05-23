from fastapi import APIRouter, UploadFile, File
import os
from app.services.pdf_loader import extract_pages_from_pdf
from app.services.chunker import chunk_text
from app.services.embeddings import get_embeddings
from app.services.vector_store import store_chunks

router = APIRouter(prefix="/upload", tags=["Upload"])

DOCUMENTS_DIR = "app/data/documents"
os.makedirs(DOCUMENTS_DIR, exist_ok=True)

@router.post("/pdf")
async def upload_pdf(file: UploadFile = File(...)):
    content = await file.read()

    # 1. Save raw PDF to disk for serving later
    file_path = os.path.join(DOCUMENTS_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(content)

    # 2. Extract pages with numbers
    pages = extract_pages_from_pdf(content)

    all_chunks = []
    all_embeddings = []
    all_metadata = []

    # 3. Process page-by-page
    for page_data in pages:
        page_num = page_data["page"]
        page_text = page_data["text"]

        chunks = chunk_text(page_text)
        if not chunks:
            continue

        embeddings = get_embeddings(chunks)

        for j, chunk in enumerate(chunks):
            all_chunks.append(chunk)
            all_embeddings.append(embeddings[j])
            all_metadata.append({
                "source": file.filename,
                "page": page_num
            })

    # 4. Store in vector DB
    if all_chunks:
        store_chunks(all_chunks, all_embeddings, all_metadata)

    return {
        "message": "PDF processed successfully",
        "chunks": len(all_chunks)
    }

@router.delete("/pdf/{filename}")
def delete_pdf(filename: str):
    try:
        from app.services.vector_store import collection
        # Delete all chunks matching this source filename from ChromaDB
        collection.delete(where={"source": filename})

        # Purge the physical file from the disk storage directory
        file_path = os.path.join(DOCUMENTS_DIR, filename)
        if os.path.exists(file_path):
            os.remove(file_path)

        return {"message": f"Successfully deleted {filename} from knowledge base."}
    except Exception as e:
        return {"error": f"Failed to delete document: {str(e)}"}

@router.get("/files")
def list_files():
    try:
        if not os.path.exists(DOCUMENTS_DIR):
            return []
        files = [f for f in os.listdir(DOCUMENTS_DIR) if f.endswith(".pdf")]
        return files
    except Exception as e:
        return []