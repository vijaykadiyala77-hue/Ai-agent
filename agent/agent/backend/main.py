"""
DevAgent.ai - FastAPI Backend
Powered by Google Gemini + GitHub integration.
"""

from __future__ import annotations

import os
from typing import Optional, List
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from agent import CodingAgent
from github_client import GitHubClient

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GITHUB_TOKEN   = os.getenv("GITHUB_TOKEN", "")
GITHUB_OWNER   = os.getenv("GITHUB_OWNER", "vijaykadiyala77-hue")
GITHUB_REPO    = os.getenv("GITHUB_REPO",  "n8n-coding-agent")
AI_MODEL       = os.getenv("AI_MODEL", "gemini-3.5-flash")
PORT           = int(os.getenv("PORT", 8000))

# ── Shared HTTP client (connection reuse for GitHub API) ─────────────────────
http_client: Optional[httpx.AsyncClient] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=30.0)
    yield
    await http_client.aclose()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="DevAgent.ai API", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request / Response Models ─────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []

class ConfirmRequest(BaseModel):
    action: str                    # "create" | "update" | "delete"
    file_path: str
    content: Optional[str] = None
    commit_message: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    status: str = "success"
    pending_action: Optional[dict] = None

# ── Helpers ───────────────────────────────────────────────────────────────────
def _make_clients():
    github = GitHubClient(
        token=GITHUB_TOKEN,
        owner=GITHUB_OWNER,
        repo=GITHUB_REPO,
        client=http_client,
    )
    agent = CodingAgent(
        api_key=GEMINI_API_KEY,
        model=AI_MODEL,
        github=github,
    )
    return github, agent

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def status():
    """Health-check + config visibility for the frontend."""
    return {
        "status": "online",
        "geminiConfigured": bool(GEMINI_API_KEY),
        "githubConfigured": bool(GITHUB_TOKEN),
        "githubOwner": GITHUB_OWNER,
        "githubRepo": GITHUB_REPO,
        "model": AI_MODEL,
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Main endpoint.
    - For general questions: returns a plain text AI response.
    - For coding tasks: inspects repo, generates code, returns pending_action.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY not configured on server.")

    github, agent = _make_clients()

    try:
        result = await agent.handle(
            message=req.message,
            history=req.history or [],
        )
        return ChatResponse(
            response=result["response"],
            status=result.get("status", "success"),
            pending_action=result.get("pending_action"),
        )
    except Exception as exc:
        raise HTTPException(502, detail=str(exc))


@app.post("/api/confirm")
async def confirm(req: ConfirmRequest):
    """
    Called after the user confirms a file write/update/delete operation.
    Commits the change to GitHub and returns the commit URL.
    """
    if not GITHUB_TOKEN:
        raise HTTPException(503, "GITHUB_TOKEN not configured on server.")

    github, _ = _make_clients()

    try:
        if req.action in ("create", "update"):
            if not req.content:
                raise HTTPException(400, "content is required for create/update")
            commit = await github.write_file(
                path=req.file_path,
                content=req.content,
                message=req.commit_message or f"Add/update {req.file_path} via DevAgent.ai",
            )
            return {
                "status": "success",
                "response": f"✅ **`{req.file_path}`** committed successfully.\n\n**Commit:** `{commit['sha'][:7]}`",
                "commit_url": commit.get("html_url"),
            }

        elif req.action == "delete":
            commit = await github.delete_file(
                path=req.file_path,
                message=req.commit_message or f"Delete {req.file_path} via DevAgent.ai",
            )
            return {
                "status": "success",
                "response": f"🗑️ **`{req.file_path}`** deleted.\n\n**Commit:** `{commit['sha'][:7]}`",
            }
        else:
            raise HTTPException(400, f"Unknown action: {req.action}")

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, detail=str(exc))


# ── Static files (serve the frontend) ────────────────────────────────────────
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    print(f"Starting DevAgent.ai backend on http://localhost:{PORT}")
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
