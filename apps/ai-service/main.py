from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import chat, rag, agents, memory, models, embeddings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"AI Service starting up — environment: {settings.environment}")
    yield
    # Shutdown
    print("AI Service shutting down")


app = FastAPI(
    title="AI Operations Copilot — AI Service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(chat.router, prefix="/ai", tags=["chat"])
app.include_router(rag.router, prefix="/ai", tags=["rag"])
app.include_router(agents.router, prefix="/ai", tags=["agents"])
app.include_router(memory.router, prefix="/ai", tags=["memory"])
app.include_router(models.router, prefix="/ai", tags=["models"])
app.include_router(embeddings.router, prefix="/ai", tags=["embeddings"])
