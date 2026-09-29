"""Serve l'app dal computer, senza cache: python servi.py  →  http://localhost:8080

Come `python -m http.server`, ma dice al browser di non tenersi i file. Con il
server normale il browser può tenere un file vecchio e caricarne uno nuovo
accanto, e l'app si rompe in modi che sul telefono non succedono."""

import http.server
import sys


class SenzaCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print(f'FitApp su http://localhost:{porta}  (Ctrl+C per fermare)')
http.server.ThreadingHTTPServer(('', porta), SenzaCache).serve_forever()
