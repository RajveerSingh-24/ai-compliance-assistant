import fitz  # PyMuPDF
import io

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")

    text = ""
    for page in doc:
        text += page.get_text()

    return text

def extract_pages_from_pdf(pdf_bytes: bytes) -> list[dict]:
    doc = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text()
        if text.strip():
            pages.append({
                "page": i + 1,
                "text": text
            })
    return pages