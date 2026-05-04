"""
File indexing pipeline:
  S3 download → text extraction → chunking → embeddings → Pinecone upsert
"""
import io
import re
import httpx
import boto3
from typing import List, Tuple
from openai import AsyncOpenAI

from app.config import settings
from app.services.pinecone_client import get_pinecone_index


# ── Text extraction ──────────────────────────────────────────────────────────

def extract_text(content: bytes, mime_type: str) -> str:
    """Extract plain text from file bytes based on MIME type."""
    if mime_type == "text/plain" or mime_type == "text/markdown" or mime_type == "text/csv":
        return content.decode("utf-8", errors="replace")

    if mime_type == "application/pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            return "\n\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()
        except ImportError:
            raise RuntimeError("pypdf not installed — cannot parse PDF")

    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        try:
            import docx
            doc = docx.Document(io.BytesIO(content))
            return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            raise RuntimeError("python-docx not installed — cannot parse DOCX")

    raise ValueError(f"Unsupported MIME type: {mime_type}")


# ── Chunking ─────────────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> List[str]:
    """
    Split text into overlapping chunks.
    Tries to split on paragraph boundaries first, then falls back to character slicing.

    Invariant: every chunk is non-empty and len(chunk) <= chunk_size * 1.2
    """
    if not text.strip():
        return []

    # Normalise whitespace
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    chunks: List[str] = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        # Try to break at a paragraph boundary within the window
        if end < len(text):
            para_break = text.rfind("\n\n", start, end)
            if para_break > start + chunk_overlap:
                end = para_break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Advance with overlap
        start = end - chunk_overlap if end < len(text) else len(text)

    return chunks


# ── S3 download ──────────────────────────────────────────────────────────────

async def download_from_s3(s3_key: str) -> Tuple[bytes, str]:
    """Download file from S3 and return (content_bytes, content_type)."""
    s3_client = boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )
    response = s3_client.get_object(Bucket=settings.aws_s3_bucket, Key=s3_key)
    content = response["Body"].read()
    content_type = response.get("ContentType", "text/plain")
    return content, content_type


# ── Embedding ────────────────────────────────────────────────────────────────

async def embed_chunks(chunks: List[str]) -> List[List[float]]:
    """Generate embeddings for a list of text chunks in batches of 100."""
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    embeddings: List[List[float]] = []
    batch_size = 100

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        response = await client.embeddings.create(
            input=batch,
            model="text-embedding-3-small",
        )
        embeddings.extend([item.embedding for item in response.data])

    return embeddings


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def index_file(
    file_id: str,
    s3_key: str,
    workspace_id: str,
    update_status_callback=None,
) -> int:
    """
    Full indexing pipeline. Returns chunk_count on success.
    Raises on any failure — caller is responsible for updating file status.
    """
    # 1. Download from S3
    content, content_type = await download_from_s3(s3_key)

    # 2. Extract text
    raw_text = extract_text(content, content_type)
    if not raw_text.strip():
        raise ValueError("File contains no extractable text")

    # 3. Chunk
    chunks = chunk_text(raw_text, chunk_size=1000, chunk_overlap=200)
    if not chunks:
        raise ValueError("No chunks produced from file")

    # 4. Embed
    embeddings = await embed_chunks(chunks)
    assert len(embeddings) == len(chunks), "Embedding count mismatch"

    # 5. Upsert to Pinecone (workspace-scoped namespace)
    index = get_pinecone_index()
    vectors = [
        {
            "id": f"{file_id}-chunk-{i}",
            "values": embeddings[i],
            "metadata": {
                "file_id": file_id,
                "workspace_id": workspace_id,
                "text": chunks[i],
                "chunk_index": i,
                "source": s3_key,
            },
        }
        for i in range(len(chunks))
    ]

    # Upsert in batches of 100
    for i in range(0, len(vectors), 100):
        index.upsert(vectors=vectors[i : i + 100], namespace=workspace_id)

    return len(chunks)


async def delete_file_vectors(file_id: str, workspace_id: str) -> None:
    """Remove all vectors for a file from Pinecone."""
    index = get_pinecone_index()
    # Pinecone supports delete by metadata filter or by ID prefix
    # We use ID prefix: {file_id}-chunk-*
    # Fetch IDs first then delete
    try:
        index.delete(
            filter={"file_id": {"$eq": file_id}},
            namespace=workspace_id,
        )
    except Exception:
        # Fallback: delete by known ID pattern (up to 10k chunks)
        ids = [f"{file_id}-chunk-{i}" for i in range(10000)]
        index.delete(ids=ids, namespace=workspace_id)
