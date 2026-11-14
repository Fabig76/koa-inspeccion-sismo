import http.server, json, os, sys, threading, urllib.parse
from socketserver import ThreadingMixIn

ROOT = sys.argv[1]; PORT = int(sys.argv[2])
DBS = {}  # path -> doc
BLOBS = {}
LOCK = threading.Lock()

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def _json(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        if p.path.startswith('/_blob/'):
            b = BLOBS.get(p.path[7:])
            if b is None: self.send_response(404); self.end_headers(); return
            self.send_response(200); self.send_header('Content-Type', 'image/jpeg'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        if p.path == '/__db':
            q = urllib.parse.parse_qs(p.query); pre = q.get('col', [''])[0]
            with LOCK:
                docs = {k: v for k, v in DBS.items() if k.rsplit('/', 1)[0] == pre} if pre else dict(DBS)
            return self._json(200, docs)
        if p.path == '/__doc':
            q = urllib.parse.parse_qs(p.query); path = q['path'][0]
            with LOCK: d = DBS.get(path)
            return self._json(200, {'exists': d is not None, 'data': d})
        return super().do_GET()
    def do_PUT(self):
        n = int(self.headers.get('Content-Length', 0)); body = self.rfile.read(n)
        p = urllib.parse.urlparse(self.path)
        if p.path.startswith('/_blob/'):
            BLOBS[p.path[7:]] = body; return self._json(200, {'ok': True})
        if p.path == '/__doc':
            q = urllib.parse.parse_qs(p.query); path = q['path'][0]
            with LOCK: DBS[path] = json.loads(body)
            return self._json(200, {'ok': True})
        self.send_response(404); self.end_headers()
    def do_DELETE(self):
        p = urllib.parse.urlparse(self.path)
        if p.path == '/__doc':
            q = urllib.parse.parse_qs(p.query); path = q['path'][0]
            with LOCK: DBS.pop(path, None)
            return self._json(200, {'ok': True})
        self.send_response(404); self.end_headers()

class S(ThreadingMixIn, http.server.HTTPServer): daemon_threads = True
S(('127.0.0.1', PORT), H).serve_forever()
