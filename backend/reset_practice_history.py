"""Reset stored practice history without touching Docker directly."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from app.config import settings


def main() -> int:
    url = f"http://localhost:{settings.port}/api/admin/reset-practice-history"
    payload = json.dumps({"confirm": settings.admin_reset_token}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"Reset failed with HTTP {exc.code}: {detail}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(
            f"Reset failed: could not reach backend at {url}. Start the backend first.",
            file=sys.stderr,
        )
        print(str(exc.reason), file=sys.stderr)
        return 1

    print("Practice history cleared.")
    print(json.dumps(body, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
