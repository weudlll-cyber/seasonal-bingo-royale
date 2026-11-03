# @file   ops/test/stub-website.py
# @module ops/test
# @brief  A stand-in for the website's authorize endpoint, for the website-install test (D37).
#
# Responsibility: answer GET <authorize path> like the website's event-bot authorize route: with
#                 the cookie "stub_user=<id>" of a known user 204 and the four identity headers,
#                 otherwise 401; a request carrying the game's proxy secret header gets 500 (the
#                 secret must never reach the website); GET /login answers 200 (the website's
#                 login page). The id header's name comes from STUB_ID_HEADER, so the test can
#                 send a broken one.
#                 Test only: never part of an install.
# Used by:        ops/test/website-vps.sh
# Spec:           docs/spec/07-integration-architecture.md §2.3

import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

USERS = {
    "u-1": ("Walter", "member,organiser", "true"),
    "u-2": ("Anna", "member", "false"),
    "u-3": ("Ada", "member,admin", "true"),
}
ID_HEADER = os.environ.get("STUB_ID_HEADER", "X-Acting-User-Id")
AUTHORIZE = os.environ.get("STUB_AUTHORIZE_PATH", "/api/games/bingo/authorize")


def stub_user(cookie):
    for part in cookie.split(";"):
        name, _, value = part.strip().partition("=")
        if name == "stub_user":
            return value
    return None


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == AUTHORIZE and self.headers.get("X-Sbr-Proxy-Secret") is not None:
            self.send_response(500)
            self.end_headers()
        elif path == AUTHORIZE:
            user = USERS.get(stub_user(self.headers.get("Cookie", "")) or "")
            if user is None:
                self.send_response(401)
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            name, roles, verified = user
            self.send_response(204)
            self.send_header("Cache-Control", "no-store")
            self.send_header(ID_HEADER, stub_user(self.headers.get("Cookie", "")))
            self.send_header("X-Acting-User", name)
            self.send_header("X-Acting-User-Roles", roles)
            self.send_header("X-Acting-User-Email-Verified", verified)
            self.end_headers()
        elif path == "/login":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"website login\n")
        else:
            self.send_response(404)
            self.end_headers()


ThreadingHTTPServer(("0.0.0.0", 3800), Handler).serve_forever()
