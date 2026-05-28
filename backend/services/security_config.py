import os


PRODUCTION_CORS_ORIGINS = [
    "https://venpro.com.br",
    "https://www.venpro.com.br",
    "https://anota-ganha-app.web.app",
    "https://anota-ganha-app.firebaseapp.com",
]

LOCAL_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]


def is_production_environment() -> bool:
    for name in ("APP_ENV", "ENVIRONMENT", "ENV", "PYTHON_ENV"):
        value = os.environ.get(name, "").strip().lower()
        if value in {"production", "prod"}:
            return True
    return bool(os.environ.get("RENDER_SERVICE_ID"))


def parse_cors_origins() -> list[str]:
    raw_origins = os.environ.get("CORS_ORIGINS", "").strip()
    if raw_origins:
        parsed = [origin.strip().rstrip("/") for origin in raw_origins.split(",") if origin.strip()]
        if parsed:
            return parsed

    if is_production_environment():
        return PRODUCTION_CORS_ORIGINS.copy()

    return [*PRODUCTION_CORS_ORIGINS, *LOCAL_CORS_ORIGINS]
