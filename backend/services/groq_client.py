import os
import re
import json
import urllib.request
import urllib.error


GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"


class GroqConfigError(RuntimeError):
    pass


def is_groq_enabled() -> bool:
    return os.getenv("AI_PROVIDER", "").strip().lower() == "groq"


def _api_key() -> str:
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        raise GroqConfigError("GROQ_API_KEY não configurada no servidor.")
    return key


def chat_completion(messages, *, temperature=0.4, max_tokens=1200, model=None):
    payload = json.dumps({
        "model": model or os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }).encode("utf-8")

    request = urllib.request.Request(
        GROQ_BASE_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {_api_key()}",
            "Content-Type": "application/json",
            "User-Agent": "VenProBackend/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Groq HTTP {e.code}: {detail}") from e

    return data["choices"][0]["message"]["content"].strip()


def extract_json_array(text: str):
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\[[\s\S]*\]", cleaned)
        if not match:
            raise
        data = json.loads(match.group(0))

    return data if isinstance(data, list) else []
