"""
github_client.py – Async GitHub REST API wrapper.
Uses the shared httpx.AsyncClient for connection reuse (low latency).
"""

from __future__ import annotations

import base64
import json
from typing import Optional, List, Dict
import httpx


class GitHubClient:
    BASE = "https://api.github.com"

    def __init__(self, token: str, owner: str, repo: str, client: httpx.AsyncClient):
        self.token = token
        self.owner = owner
        self.repo = repo
        self.client = client
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "DevAgent.ai/2.0",
        }

    # ── Internal ─────────────────────────────────────────────────────────────

    async def _get(self, path: str) -> dict | list:
        url = f"{self.BASE}{path}"
        r = await self.client.get(url, headers=self.headers)
        r.raise_for_status()
        return r.json()

    async def _put(self, path: str, body: dict) -> dict:
        url = f"{self.BASE}{path}"
        r = await self.client.put(url, headers=self.headers, json=body)
        r.raise_for_status()
        return r.json()

    async def _delete(self, path: str, body: dict) -> dict:
        url = f"{self.BASE}{path}"
        r = await self.client.request("DELETE", url, headers=self.headers, json=body)
        r.raise_for_status()
        return r.json()

    def _contents_path(self, file_path: str) -> str:
        return f"/repos/{self.owner}/{self.repo}/contents/{file_path}"

    # ── Public API ────────────────────────────────────────────────────────────

    async def list_files(self, path: str = "") -> list[dict]:
        """Return a flat list of {name, path, type, size} entries for a directory."""
        try:
            items = await self._get(self._contents_path(path))
            if isinstance(items, list):
                return [
                    {"name": i["name"], "path": i["path"], "type": i["type"], "size": i.get("size", 0)}
                    for i in items
                ]
            # single file – shouldn't happen for root but handle gracefully
            return [{"name": items["name"], "path": items["path"], "type": "file", "size": items.get("size", 0)}]
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return []
            raise

    async def read_file(self, file_path: str) -> str:
        """Return decoded file content as a string."""
        data = await self._get(self._contents_path(file_path))
        if isinstance(data, dict) and data.get("encoding") == "base64":
            return base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        raise ValueError(f"Unexpected response for {file_path}")

    async def read_file_safe(self, file_path: str) -> Optional[str]:
        """Return file content or None if file doesn't exist."""
        try:
            return await self.read_file(file_path)
        except Exception:
            return None

    async def get_sha(self, file_path: str) -> Optional[str]:
        """Return the blob SHA of a file, or None if it doesn't exist."""
        try:
            data = await self._get(self._contents_path(file_path))
            return data.get("sha") if isinstance(data, dict) else None
        except Exception:
            return None

    async def write_file(self, path: str, content: str, message: str) -> dict:
        """Create or update a file. Returns commit info dict."""
        sha = await self.get_sha(path)
        body = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
        }
        if sha:
            body["sha"] = sha
        data = await self._put(self._contents_path(path), body)
        commit = data.get("commit", {})
        return {
            "sha": commit.get("sha", ""),
            "html_url": commit.get("html_url", ""),
        }

    async def delete_file(self, path: str, message: str) -> dict:
        """Delete a file from the repository."""
        sha = await self.get_sha(path)
        if not sha:
            raise FileNotFoundError(f"{path} not found in repo")
        body = {"message": message, "sha": sha}
        data = await self._delete(self._contents_path(path), body)
        commit = data.get("commit", {})
        return {
            "sha": commit.get("sha", ""),
            "html_url": commit.get("html_url", ""),
        }

    async def repo_summary(self, max_files: int = 40) -> str:
        """
        Return a compact textual summary of the repository root contents.
        Keeps the AI prompt small to reduce latency.
        """
        files = await self.list_files("")
        if not files:
            return "Repository is empty."
        lines = [f"Repository: {self.owner}/{self.repo}", "Files:"]
        for f in files[:max_files]:
            icon = "📁" if f["type"] == "dir" else "📄"
            lines.append(f"  {icon} {f['path']}")
        if len(files) > max_files:
            lines.append(f"  ... and {len(files) - max_files} more files")
        return "\n".join(lines)
