"""
agent.py – Core AI agent logic powered by Google Gemini.

Architecture:
  1. Detect if the user wants a coding task (file action) or general chat.
  2. For coding tasks: fetch repo summary, call Gemini with structured JSON prompt.
  3. For general chat: call Gemini with the multilingual assistant prompt.
  4. Parse the response and return it to the frontend.
"""

from __future__ import annotations

import json
import re
from typing import Optional, List, Dict

from google import genai
from google.genai import types

from github_client import GitHubClient


# ── System Prompts ────────────────────────────────────────────────────────────

GENERAL_SYSTEM_PROMPT = """You are the AI assistant for DevAgent.ai.

Your job: Answer user questions clearly, briefly, and naturally — directly through this backend, without any external tool or automation dependency.

Rules:
- Understand user intent, keep conversation context.
- Match user's language: English, Telugu, Telugu-English (Tenglish), or Hinglish.
- Give short, clear, helpful answers.
- Never make up facts or claim you did something you didn't.
- Never ask for passwords, API keys, OTPs, or sensitive info.
- Politely refuse unsafe or illegal requests.
- If you don't know something or can't do it, say so honestly instead of guessing.

Capabilities:
- Answer questions & explain concepts
- Help with coding/debugging
- Write & edit text
- Brainstorm ideas
- Solve basic math/reasoning

Formatting:
- Use Markdown for formatting (bold, code blocks, lists, etc.)
- Use appropriate code fences with language tags for code snippets
- Keep responses concise but complete

Goal: Be a fast, reliable, standalone assistant for DevAgent.ai."""


CODING_SYSTEM_PROMPT = """You are DevAgent.ai – an autonomous software development assistant.

You help users write, modify, and manage code in their GitHub repository.

## Core Behaviour
- Always inspect the repository first (it is provided to you in the context).
- For coding tasks, produce working, clean code.
- Keep explanations concise but clear.
- If a task requires creating or modifying a file, include the full file content.
- Never expose credentials, API keys, or tokens.
- Before destructive operations (delete, overwrite), explain what will happen.
- Match user's language: English, Telugu, Telugu-English (Tenglish), or Hinglish.

## Response Format
Always respond with ONLY a valid JSON object matching this schema:

{
  "explanation": "<short explanation of what you are doing / did>",
  "action": "none" | "create" | "update" | "delete",
  "file_path": "<relative path in repo, e.g. calculator.py>",
  "content": "<full file content if action is create/update, else null>",
  "commit_message": "<concise git commit message if action != none, else null>",
  "language": "<programming language of the file, e.g. python>"
}

Rules:
- action = "none"   → you are answering a question or explaining something (no file changes)
- action = "create" → you are creating a new file (provide full content)
- action = "update" → you are modifying an existing file (provide full new content)
- action = "delete" → you want to delete a file (content = null)
- The "explanation" field is always shown to the user.
- If you produce code, put it inside "content".
- Do NOT wrap the JSON in markdown code fences."""


# ── Coding intent keywords ────────────────────────────────────────────────────

CODING_KEYWORDS = [
    # English
    "create a file", "create file", "make a file", "write a file",
    "update file", "modify file", "edit file", "change file",
    "delete file", "remove file",
    "create a script", "write a script", "make a script",
    "commit", "push to github", "add to repo", "add to repository",
    "create a program", "write a program", "build a program",
    # Patterns
    "create a .py", "create a .js", "create a .html",
    # Telugu/Tenglish
    "file create cheyyi", "file rayyi", "program rayyi",
    "code rayyi", "script create cheyyi",
]

FILE_ACTION_PATTERN = re.compile(
    r'\b(create|make|write|update|modify|edit|delete|remove)\b.*\b(file|script|program|\.py|\.js|\.ts|\.html|\.css|\.json|\.java|\.cpp|\.go|\.rs)\b',
    re.IGNORECASE,
)


class CodingAgent:
    def __init__(
        self,
        api_key: str,
        model: str,
        github: GitHubClient,
    ):
        self.api_key = api_key
        self.model = model
        self.github = github
        # Initialize Gemini client
        self.client = genai.Client(api_key=api_key)

    # ── Public ────────────────────────────────────────────────────────────────

    async def handle(self, message: str, history: list[dict]) -> dict:
        """
        Process a user message.
        Returns a dict with keys: response, status, pending_action (optional).
        """
        is_coding = self._is_coding_request(message)

        if is_coding:
            return await self._handle_coding(message, history)
        else:
            return await self._handle_general(message, history)

    # ── General Chat ──────────────────────────────────────────────────────────

    async def _handle_general(self, message: str, history: list[dict]) -> dict:
        """Handle general Q&A, explanations, brainstorming, etc."""
        contents = self._build_gemini_contents(history, message)

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=GENERAL_SYSTEM_PROMPT,
                    temperature=0.7,
                    max_output_tokens=4096,
                ),
            )
            reply = response.text or "I couldn't generate a response. Please try again."
        except Exception as exc:
            reply = f"**Error**: {str(exc)}\n\nPlease check your Gemini API key and try again."

        return {
            "response": reply,
            "status": "success",
        }

    # ── Coding Tasks ──────────────────────────────────────────────────────────

    async def _handle_coding(self, message: str, history: list[dict]) -> dict:
        """Handle coding tasks — inspect repo, generate code, return pending_action."""
        # 1. Get compact repo snapshot
        repo_summary = await self.github.repo_summary()

        # 2. If the message references a specific file that exists, read it
        extra_context = await self._maybe_read_relevant_file(message)

        # 3. Build system prompt with repo context
        system_prompt = CODING_SYSTEM_PROMPT
        system_prompt += f"\n\n## Repository Context\n{repo_summary}"
        if extra_context:
            system_prompt += extra_context

        # 4. Build contents for Gemini
        contents = self._build_gemini_contents(history, message)

        # 5. Call Gemini
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.2,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )
            raw = response.text or "{}"
        except Exception as exc:
            return {
                "response": f"**Error**: {str(exc)}\n\nPlease check your Gemini API key and try again.",
                "status": "error",
            }

        # 6. Parse structured response
        parsed = self._parse_response(raw)
        explanation = parsed.get("explanation", raw)
        action = parsed.get("action", "none")
        file_path = parsed.get("file_path")
        content = parsed.get("content")
        commit_message = parsed.get("commit_message")
        language = parsed.get("language", "")

        # 7. Build display text
        display = self._format_display(explanation, action, file_path, content, language)

        result: dict = {
            "response": display,
            "status": "success",
        }

        # 8. If there's a file action, return pending_action
        if action in ("create", "update", "delete") and file_path:
            result["pending_action"] = {
                "action": action,
                "file_path": file_path,
                "content": content,
                "commit_message": commit_message or f"{action.capitalize()} {file_path} via DevAgent.ai",
                "language": language,
            }

        return result

    # ── Private helpers ───────────────────────────────────────────────────────

    def _is_coding_request(self, message: str) -> bool:
        """Detect if the user wants to perform a file/coding action in the repo."""
        msg_lower = message.lower()

        # Check keyword phrases
        for kw in CODING_KEYWORDS:
            if kw in msg_lower:
                return True

        # Check regex pattern
        if FILE_ACTION_PATTERN.search(message):
            return True

        return False

    def _build_gemini_contents(
        self, history: list[dict], message: str
    ) -> list[types.Content]:
        """Build Gemini-format contents from chat history + current message."""
        contents = []

        # Convert chat history (keep last 8 turns)
        for msg in history[-8:]:
            role = "user" if msg.get("role") == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.get("content", ""))],
                )
            )

        # Current user message
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=message)],
            )
        )

        return contents

    async def _maybe_read_relevant_file(self, message: str) -> Optional[str]:
        """
        If the message mentions a filename that likely exists in the repo, read it.
        Keeps the prompt small by only reading when relevant.
        """
        pattern = re.compile(
            r'\b([A-Za-z0-9_\-]+\.(py|js|ts|html|css|md|json|txt|yaml|yml|sh|java|cpp|c|go|rs))\b',
            re.IGNORECASE,
        )
        matches = pattern.findall(message)
        if not matches:
            return None

        file_name = matches[0][0]
        content = await self.github.read_file_safe(file_name)
        if content:
            truncated = content[:3000] + ("\n... [truncated]" if len(content) > 3000 else "")
            return f"\n### Current content of `{file_name}`:\n```\n{truncated}\n```"
        return None

    def _parse_response(self, raw: str) -> dict:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Fallback: extract JSON from markdown code fence if model misbehaves
            match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(1))
                except Exception:
                    pass
            return {"explanation": raw, "action": "none"}

    def _format_display(
        self,
        explanation: str,
        action: str,
        file_path: Optional[str],
        content: Optional[str],
        language: str,
    ) -> str:
        """Format the AI reply into Markdown that the frontend can render."""
        parts = [explanation]

        if action != "none" and file_path:
            action_label = {"create": "🆕 Create", "update": "✏️ Update", "delete": "🗑️ Delete"}.get(action, action)
            parts.append(f"\n**{action_label}**: `{file_path}`")

        if content and action in ("create", "update"):
            lang = language or _guess_lang(file_path or "")
            parts.append(f"\n```{lang}\n{content}\n```")

        if action in ("create", "update", "delete") and file_path:
            parts.append(
                "\n\n> ⚠️ **Confirmation required** — click **Confirm & Commit** below to apply this change to GitHub."
            )

        return "\n".join(parts)


def _guess_lang(path: str) -> str:
    ext_map = {
        ".py": "python", ".js": "javascript", ".ts": "typescript",
        ".html": "html", ".css": "css", ".json": "json",
        ".md": "markdown", ".sh": "bash", ".yaml": "yaml", ".yml": "yaml",
        ".java": "java", ".cpp": "cpp", ".c": "c", ".go": "go", ".rs": "rust",
    }
    for ext, lang in ext_map.items():
        if path.endswith(ext):
            return lang
    return ""
