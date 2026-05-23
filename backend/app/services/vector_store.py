import chromadb

client = chromadb.PersistentClient(path="app/data/chroma_db")
collection = client.get_or_create_collection(name="documents")


def store_chunks(chunks, embeddings, metadata_list):
    for i, chunk in enumerate(chunks):
        # Use a combination of the filename and index to ensure globally unique IDs
        source_name = metadata_list[i].get("source", "doc").replace(" ", "_")
        chunk_id = f"{source_name}_chunk_{i}"
        collection.add(
            documents=[chunk],
            embeddings=[embeddings[i]],
            metadatas=[metadata_list[i]],
            ids=[chunk_id]
        )


def search(query_embedding, top_k=3):
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k
    )
    return results