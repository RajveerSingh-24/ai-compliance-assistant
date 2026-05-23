from app.services.embeddings import model
from app.services.vector_store import collection
from app.llm.ollama_client import generate_answer


def search_similar_chunks(query: str, top_k: int = 3):
    query_embedding = model.encode(query).tolist()

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k
    )

    return results


def build_context(chunks):
    return "\n\n".join(chunks)


def rag_answer(query: str):
    results = search_similar_chunks(query)

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
{query}

Answer with clear explanation and mention source chunks.
"""

    answer = generate_answer(prompt)

    sources = []
    for i, doc in enumerate(docs):
        meta = metadatas[i] if i < len(metadatas) else {}
        sources.append({
            "content": doc,
            "source": meta.get("source", "Unknown Document"),
            "page": meta.get("page", 1)
        })

    return {
        "answer": answer,
        "sources": sources
    }