from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.api.upload import router as upload_router
from app.api.chat import router as chat_router

app = FastAPI(title="AI Compliance Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure the documents directory exists and mount it
os.makedirs("app/data/documents", exist_ok=True)
app.mount("/documents", StaticFiles(directory="app/data/documents"), name="documents")

# Generate a gorgeous placeholder OSHA3021.pdf if not present for instant testing
sample_pdf_path = "app/data/documents/OSHA3021.pdf"
if not os.path.exists(sample_pdf_path):
    try:
        import fitz
        doc = fitz.open()
        
        # Page 1
        page1 = doc.new_page()
        # Draw header
        page1.insert_text((50, 60), "OSHA Compliance Guidelines (OSHA 3021)", fontsize=18, color=(0.1, 0.2, 0.6))
        page1.insert_text((50, 110), "Section 1: General Working Hours & Policies", fontsize=13, color=(0.1, 0.1, 0.1))
        page1.insert_text((50, 140), "Standard working hours are 9:00 AM to 6:00 PM, Monday through Friday.", fontsize=11, color=(0.3, 0.3, 0.3))
        page1.insert_text((50, 160), "All employees are entitled to a 1-hour lunch break daily.", fontsize=11, color=(0.3, 0.3, 0.3))
        page1.insert_text((50, 180), "Overtime must be pre-approved by the department manager in writing.", fontsize=11, color=(0.3, 0.3, 0.3))
        
        # Page 2
        page2 = doc.new_page()
        page2.insert_text((50, 60), "OSHA Compliance Guidelines (OSHA 3021)", fontsize=18, color=(0.1, 0.2, 0.6))
        page2.insert_text((50, 110), "Section 2: Data Security & Information Classification", fontsize=13, color=(0.1, 0.1, 0.1))
        page2.insert_text((50, 140), "Confidential customer information must be classified strictly as Class-A Sensitive.", fontsize=11, color=(0.3, 0.3, 0.3))
        page2.insert_text((50, 160), "Any data transfer outside the corporate VPN requires dual-factor authentication.", fontsize=11, color=(0.3, 0.3, 0.3))
        page2.insert_text((50, 180), "Encryption is mandatory for all stationary and in-transit records.", fontsize=11, color=(0.3, 0.3, 0.3))

        doc.save(sample_pdf_path)
        doc.close()
        print("Generated sample OSHA3021.pdf successfully!")
    except Exception as e:
        print(f"Error creating placeholder PDF: {e}")

app.include_router(upload_router)
app.include_router(chat_router)


@app.get("/")
def root():
    return {"message": "RAG System Running"}