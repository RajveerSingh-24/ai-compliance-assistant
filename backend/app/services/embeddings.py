from sentence_transformers import SentenceTransformer

# lightweight + fast + free
model = SentenceTransformer("all-MiniLM-L6-v2")

def get_embeddings(texts: list[str]):
    return model.encode(texts).tolist()