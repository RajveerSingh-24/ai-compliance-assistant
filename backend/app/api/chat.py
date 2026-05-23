from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import requests
from app.services.rag import rag_answer, search_similar_chunks, build_context

router = APIRouter(prefix="/chat", tags=["Chat"])


class Query(BaseModel):
    question: str


@router.post("/")
def chat(query: Query):
    result = rag_answer(query.question)

    return result


@router.post("/stream")
def chat_stream(query: Query):
    results = search_similar_chunks(query.question)
    docs = results["documents"][0]
    metadatas = results["metadatas"][0] if "metadatas" in results and results["metadatas"] else []

    context = build_context(docs)

    prompt = f"""
You are an AI Compliance Assistant.

Answer ONLY using the context below.
If answer is not in context, say "Not found in documents".

Context:
{context}

Question:
{query.question}

Answer with clear explanation and mention source chunks.
"""

    sources = []
    for i, doc in enumerate(docs):
        meta = metadatas[i] if i < len(metadatas) else {}
        sources.append({
            "content": doc,
            "source": meta.get("source", "Unknown Document"),
            "page": meta.get("page", 1)
        })

    def event_generator():
        # Send sources immediately so the client can prepare cited chips
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        try:
            response = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "llama3",
                    "prompt": prompt,
                    "stream": True
                },
                stream=True
            )
            for line in response.iter_lines():
                if line:
                    chunk = json.loads(line.decode("utf-8"))
                    text = chunk.get("response", "")
                    if text:
                        yield f"data: {json.dumps({'type': 'content', 'content': text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'content', 'content': f'Streaming Error: {str(e)}'})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")