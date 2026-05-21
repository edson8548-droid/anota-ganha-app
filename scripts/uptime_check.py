import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API_BASE_URL = os.environ.get("VENPRO_API_BASE_URL", "https://api.venpro.com.br").rstrip("/")
SITE_BASE_URL = os.environ.get("VENPRO_SITE_BASE_URL", "https://venpro.com.br").rstrip("/")
TIMEOUT_SECONDS = 30


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def request_json(url: str) -> dict:
    try:
        with urlopen(Request(url, headers={"Accept": "application/json"}), timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            body = response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError) as exc:
        fail(f"{url} failed: {exc}")

    if status < 200 or status >= 300:
        fail(f"{url} returned HTTP {status}")

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        fail(f"{url} returned invalid JSON: {exc}")


def request_status(url: str) -> int:
    try:
        request = Request(
            url,
            method="GET",
            headers={
                "Accept": "text/html",
                "Range": "bytes=0-1024",
                "User-Agent": "VenPro-Uptime-Monitor/1.0",
            },
        )
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status
    except HTTPError as exc:
        return exc.code
    except (URLError, TimeoutError) as exc:
        fail(f"{url} failed: {exc}")


def check_api_health() -> None:
    payload = request_json(f"{API_BASE_URL}/health")
    print(f"API health: {payload}")

    if payload.get("status") != "healthy":
        fail(f"API status is not healthy: {payload.get('status')}")
    if payload.get("database") != "connected":
        fail(f"Database is not connected: {payload.get('database')}")


def check_payment_provider() -> None:
    payload = request_json(f"{API_BASE_URL}/")
    print(f"API root: {payload}")

    payments = payload.get("payments") or []
    if "asaas" not in payments:
        fail("Asaas is not listed as an active payment provider")
    if "mercadopago" in payments:
        fail("Mercado Pago appeared as an active payment provider")


def check_site_pages() -> None:
    for path in ["/home.html", "/login", "/plans"]:
        url = f"{SITE_BASE_URL}{path}"
        status = request_status(url)
        print(f"Site page {url}: HTTP {status}")
        if status < 200 or status >= 400:
            fail(f"{url} returned HTTP {status}")


def main() -> None:
    check_api_health()
    check_payment_provider()
    check_site_pages()
    print("Uptime checks passed.")


if __name__ == "__main__":
    main()
