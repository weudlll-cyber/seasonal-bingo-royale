# @file   ops/test/stub-website.py
# @module ops/test
# @brief  A stand-in for the website's authorize endpoint and account-changes feed, for the website-install test.
#
# Responsibility: answer GET <authorize path> as the website does since 2026-11-04: with the
#                 cookie "stub_user=<id>" of a known user 204 and the identity headers (id, name,
#                 roles, e-mail verified, may host, steps as base64url JSON); anyone else 204 with
#                 only X-Acting-Guest: true (STUB_REFUSE=1: 401, as an older website did); a
#                 request carrying the game's proxy secret header gets 500 (the secret must
#                 never reach the website); it records the Cookie, Origin and X-Original-Method it
#                 got. GET /api/games/bingo/account-changes?since=<n> needs X-Games-Sync-Token
#                 equal to STUB_SYNC_TOKEN (else 401) and, once GET /stub/arm was called, answers
#                 one "rights" change for user 1 after cursor 0, else nothing; every feed request is counted (GET /stub/feed).
#                 GET /login answers 200 (the website's login page). The id header's name comes
#                 from STUB_ID_HEADER, so the test can send a broken one.
#                 Test only: never part of an install.
# Used by:        ops/test/website-vps.sh
# Spec:           docs/spec/07-integration-architecture.md §2.3, §2.4

import base64
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

STEPS = [{"ladder": "holder", "name": "Golden", "icon": "/media/step-icons/golden.webp"}]
# id: (name, roles, e-mail verified, may host, steps)
USERS = {
    "1": ("Walter", "member", "true", "true", STEPS),
    "2": ("Anna", "member", "false", "false", []),
    "3": ("Ada", "member,admin", "true", "false", []),
}
ID_HEADER = os.environ.get("STUB_ID_HEADER", "X-Acting-User-Id")
AUTHORIZE = os.environ.get("STUB_AUTHORIZE_PATH", "/api/games/bingo/authorize")
TOKEN = os.environ.get("STUB_SYNC_TOKEN", "")
REFUSE = os.environ.get("STUB_REFUSE") == "1"
SEEN = {"armed": False, "feed": 0, "feed_refused": 0, "method": "", "origin": "", "cookie": ""}


def stub_user(cookie):
    for part in cookie.split(";"):
        name, _, value = part.strip().partition("=")
        if name == "stub_user":
            return value
    return None


def steps_header(steps):
    return base64.urlsafe_b64encode(json.dumps(steps, separators=(",", ":")).encode()).decode().rstrip("=")


class Handler(BaseHTTPRequestHandler):
    def answer(self, status, body=None, headers=()):
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        if body is not None:
            self.wfile.write(body)

    def authorize(self):
        SEEN["method"] = self.headers.get("X-Original-Method", "")
        SEEN["origin"] = self.headers.get("Origin", "")
        SEEN["cookie"] = self.headers.get("Cookie", "")
        uid = stub_user(self.headers.get("Cookie", "")) or ""
        user = USERS.get(uid)
        if user is None:
            if REFUSE:
                self.answer(401)
            else:
                self.answer(204, headers=[("X-Acting-Guest", "true")])
            return
        name, roles, verified, can_host, steps = user
        self.answer(204, headers=[
            (ID_HEADER, uid), ("X-Acting-User", name), ("X-Acting-User-Roles", roles),
            ("X-Acting-User-Email-Verified", verified), ("X-Acting-User-Can-Host", can_host),
            ("X-Acting-User-Steps", steps_header(steps)),
        ])

    def feed(self, since):
        if TOKEN == "" or self.headers.get("X-Games-Sync-Token") != TOKEN:
            SEEN["feed_refused"] += 1
            self.answer(401)
            return
        SEEN["feed"] += 1
        change = SEEN["armed"] and since == "0"
        page = {"changes": [{"id": 1, "kind": "rights"}], "next": "1"} if change else {"changes": [], "next": since}
        self.answer(200, json.dumps(page).encode(), [("Content-Type", "application/json")])

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == AUTHORIZE and self.headers.get("X-Sbr-Proxy-Secret") is not None:
            self.answer(500)
        elif url.path == AUTHORIZE:
            self.authorize()
        elif url.path == "/api/games/bingo/account-changes":
            self.feed(parse_qs(url.query).get("since", ["0"])[0])
        elif url.path == "/stub/arm":
            SEEN["armed"] = True
            self.answer(204)
        elif url.path == "/stub/feed":
            self.answer(200, json.dumps(SEEN).encode())
        elif url.path == "/login":
            self.answer(200, b"website login\n")
        else:
            self.answer(404)


ThreadingHTTPServer(("0.0.0.0", 3800), Handler).serve_forever()
