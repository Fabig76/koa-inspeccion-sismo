#!/usr/bin/env node
/*
 * Servidor del Portal de Inspección KOA (sin dependencias, Node 18+).
 * - Sirve index.html
 * - Guarda registros y fotos de la inspección en ./data (o DATA_DIR)
 * - Variables: PORT (8000 por defecto, el puerto que publica exe.dev)
 *              PORTAL_TOKEN (opcional: clave que el portal pide para leer/escribir)
 *              DATA_DIR (opcional)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8000;
const TOKEN = process.env.PORTAL_TOKEN || '';
const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const PHOTOS = path.join(DATA, 'photos');
const STATE_FILE = path.join(DATA, 'state.json');
fs.mkdirSync(PHOTOS, { recursive: true });

let state = { inspector: null, items: {} };
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* primer arranque */ }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  }, 250);
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function authorized(req, url) {
  if (!TOKEN) return true;
  const t = String(req.headers['x-portal-token'] || url.searchParams.get('t') || '');
  const a = Buffer.from(t), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('Archivo demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const INDEX = path.join(ROOT, 'index.html');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (p === '/api/health') return json(res, 200, { ok: true, app: 'koa-inspeccion', auth: !!TOKEN });

    if (p.startsWith('/api/')) {
      if (!authorized(req, url)) return json(res, 401, { error: 'token' });

      if (p === '/api/state' && req.method === 'GET') return json(res, 200, state);

      if (p === '/api/inspector' && req.method === 'PUT') {
        const data = JSON.parse(await readBody(req, 1e5));
        if (!state.inspector || (data.updatedAt || 0) >= (state.inspector.updatedAt || 0)) { state.inspector = data; save(); }
        return json(res, 200, { ok: true });
      }

      let m = p.match(/^\/api\/items\/([^/]+)$/);
      if (m && req.method === 'PUT') {
        const id = m[1]; if (!ID.test(id)) return json(res, 400, { error: 'id' });
        const rec = JSON.parse(await readBody(req, 2e6));
        const cur = state.items[id];
        if (!cur || (rec.updatedAt || 0) >= (cur.updatedAt || 0)) { state.items[id] = rec; save(); }
        return json(res, 200, { ok: true });
      }

      m = p.match(/^\/api\/photos\/([^/]+)$/);
      if (m) {
        const id = m[1]; if (!ID.test(id)) return json(res, 400, { error: 'id' });
        const file = path.join(PHOTOS, id + '.jpg');
        if (req.method === 'PUT') { fs.writeFileSync(file, await readBody(req, 15e6)); return json(res, 200, { ok: true }); }
        if (req.method === 'GET') {
          if (!fs.existsSync(file)) return json(res, 404, { error: 'no existe' });
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
          return fs.createReadStream(file).pipe(res);
        }
      }
      return json(res, 404, { error: 'no encontrado' });
    }

    // Librerías 3D locales
    const vend = p.match(/^\/vendor\/(three\.module\.min\.js|OrbitControls\.js)$/);
    if (vend) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return fs.createReadStream(path.join(ROOT, 'vendor', vend[1])).pipe(res);
    }

    // Cualquier otra ruta: el portal
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    fs.createReadStream(INDEX).pipe(res);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => console.log(`Portal KOA en http://localhost:${PORT}  ·  datos en ${DATA}  ·  clave ${TOKEN ? 'activada' : 'desactivada'}`));
