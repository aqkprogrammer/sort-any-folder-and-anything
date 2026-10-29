#!/usr/bin/env python3
"""Tiny static server for the web version (no caching, so edits show up on reload).
Usage: python3 scripts/serve.py [port]"""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f'Photo Sorter → http://localhost:{port}')
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
