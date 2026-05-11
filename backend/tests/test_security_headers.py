import sys
import os

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.security_headers import SecurityHeadersMiddleware


def test_security_headers_are_added_to_api_responses():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/ok")
    async def ok():
        return {"ok": True}

    response = TestClient(app).get("/ok", headers={"x-forwarded-proto": "https"})

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in response.headers["Permissions-Policy"]
    assert response.headers["Strict-Transport-Security"] == "max-age=31536000; includeSubDomains"
