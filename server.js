#!/usr/bin/env node
/*
 * Servidor del Portal de Inspección KOA (sin dependencias, Node 18+).
 *
 *  - Acceso solo con usuario y contraseña (sesión con cookie segura).
 *  - Guarda registros y fotos de la inspección en ./data (o DATA_DIR).
 *  - Las contraseñas NUNCA van en el repositorio: se guardan cifradas (scrypt)
 *    en data/users.json, que se crea en el servidor con:
 *
 *      node server.js usuario <nombre> <contraseña>     crear o cambiar contraseña
 *      node server.js usuarios                          listar usuarios
 *      node server.js borrar-usuario <nombre>           eliminar usuario
 *
 *  Variables: PORT (8000 por defecto, el que publica exe.dev), DATA_DIR (opcional)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8000;
const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const PHOTOS = path.join(DATA, 'photos');
const STATE_FILE = path.join(DATA, 'state.json');
const USERS_FILE = path.join(DATA, 'users.json');
const SESS_FILE = path.join(DATA, 'sessions.json');
const SESSION_DAYS = 30;
fs.mkdirSync(PHOTOS, { recursive: true });

const readJSON = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const writeJSON = (f, obj) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o600 }); fs.renameSync(tmp, f); };
const hashPass = (pass, salt) => crypto.scryptSync(String(pass), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// ---------- Administración de usuarios por consola ----------
const [cmd, a1, a2] = process.argv.slice(2);
if (cmd) {
  const users = readJSON(USERS_FILE, {});
  if (cmd === 'usuario') {
    if (!a1 || !a2) { console.error('Uso: node server.js usuario <nombre> <contraseña>'); process.exit(1); }
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(a1)) { console.error('Nombre de usuario inválido (3-40 letras, números, . _ -)'); process.exit(1); }
    if (a2.length < 8) { console.error('La contraseña debe tener al menos 8 caracteres'); process.exit(1); }
    const salt = crypto.randomBytes(16).toString('hex');
    users[a1.toLowerCase()] = { salt, hash: hashPass(a2, salt), updatedAt: Date.now() };
    writeJSON(USERS_FILE, users);
    // Cierra las sesiones abiertas de ese usuario
    const ss = readJSON(SESS_FILE, {}); for (const k in ss) if (ss[k].user === a1.toLowerCase()) delete ss[k]; writeJSON(SESS_FILE, ss);
    console.log(`Usuario "${a1.toLowerCase()}" guardado.`);
  } else if (cmd === 'usuarios') {
    const list = Object.keys(users); console.log(list.length ? list.join('\n') : '(sin usuarios)');
  } else if (cmd === 'borrar-usuario') {
    delete users[String(a1).toLowerCase()]; writeJSON(USERS_FILE, users);
    const ss = readJSON(SESS_FILE, {}); for (const k in ss) if (ss[k].user === String(a1).toLowerCase()) delete ss[k]; writeJSON(SESS_FILE, ss);
    console.log(`Usuario "${a1}" eliminado.`);
  } else { console.error('Comandos: usuario <nombre> <contraseña> | usuarios | borrar-usuario <nombre>'); process.exit(1); }
  process.exit(0);
}

// ---------- Estado ----------
let state = readJSON(STATE_FILE, { inspector: null, items: {} });
let sessions = readJSON(SESS_FILE, {}); // sha256(token) -> { user, exp }
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeJSON(STATE_FILE, state), 250); }
function saveSessions() { const now = Date.now(); for (const k in sessions) if (sessions[k].exp < now) delete sessions[k]; writeJSON(SESS_FILE, sessions); }

// ---------- Utilidades HTTP ----------
function json(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('Archivo demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function cookies(req) { const o = {}; String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
function isHttps(req) { return req.headers['x-forwarded-proto'] === 'https'; }
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function sessionUser(req) {
  const t = cookies(req).koa_s; if (!t) return null;
  const s = sessions[sha(t)]; if (!s || s.exp < Date.now()) return null;
  if (!readJSON(USERS_FILE, {})[s.user]) return null; // usuario eliminado
  return s.user;
}
const SEC_HEADERS = { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };

// Bloqueo por intentos fallidos: 5 intentos -> 10 minutos
const fails = new Map();
function locked(key) { const f = fails.get(key); return f && f.until > Date.now(); }
function fail(key) { const f = fails.get(key) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) { f.until = Date.now() + 10 * 60e3; f.n = 0; } fails.set(key, f); }

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const INDEX = path.join(ROOT, 'index.html');
const LOGIN = path.join(ROOT, 'login.html');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    // ---- Rutas públicas ----
    if (p === '/api/health') return json(res, 200, { ok: true, app: 'koa-inspeccion', auth: 'session' });
    if (p === '/login' || p === '/login.html') {
      if (sessionUser(req)) { res.writeHead(302, { Location: './' }); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS });
      return fs.createReadStream(LOGIN).pipe(res);
    }
    if (p === '/api/login' && req.method === 'POST') {
      const ip = clientIp(req);
      let body; try { body = JSON.parse(await readBody(req, 4096)); } catch { return json(res, 400, { error: 'Solicitud inválida' }); }
      const user = String(body.user || '').trim().toLowerCase(), pass = String(body.pass || '');
      const key = ip + '|' + user;
      if (locked(key) || locked(ip)) return json(res, 429, { error: 'Demasiados intentos fallidos. Espere 10 minutos.' });
      const u = readJSON(USERS_FILE, {})[user];
      const ok = u && crypto.timingSafeEqual(Buffer.from(hashPass(pass, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
      if (!ok) { fail(key); fail(ip); await new Promise(r => setTimeout(r, 600)); return json(res, 401, { error: 'Usuario o contraseña incorrectos' }); }
      fails.delete(key); fails.delete(ip);
      const token = crypto.randomBytes(32).toString('base64url');
      sessions[sha(token)] = { user, exp: Date.now() + SESSION_DAYS * 864e5, ip, at: Date.now() };
      saveSessions();
      const cookie = `koa_s=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? '; Secure' : ''}`;
      return json(res, 200, { ok: true, user }, { 'Set-Cookie': cookie });
    }

    // ---- Todo lo demás exige sesión ----
    const user = sessionUser(req);
    if (!user) {
      if (p.startsWith('/api/')) return json(res, 401, { error: 'login' });
      res.writeHead(302, { Location: 'login', 'Cache-Control': 'no-store' }); return res.end();
    }

    if (p === '/api/logout' && req.method === 'POST') {
      const t = cookies(req).koa_s; if (t) { delete sessions[sha(t)]; saveSessions(); }
      return json(res, 200, { ok: true }, { 'Set-Cookie': `koa_s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? '; Secure' : ''}` });
    }
    if (p === '/api/me') return json(res, 200, { user });
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
      rec.user = user; // usuario que hizo el último cambio
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
    if (p.startsWith('/api/')) return json(res, 404, { error: 'no encontrado' });

    // Librerías 3D locales
    const vend = p.match(/^\/vendor\/(three\.module\.min\.js|OrbitControls\.js)$/);
    if (vend) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'private, max-age=86400' });
      return fs.createReadStream(path.join(ROOT, 'vendor', vend[1])).pipe(res);
    }

    // El portal
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS });
    fs.createReadStream(INDEX).pipe(res);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

const nUsers = Object.keys(readJSON(USERS_FILE, {})).length;
server.listen(PORT, () => {
  console.log(`Portal KOA en http://localhost:${PORT}  ·  datos en ${DATA}  ·  ${nUsers} usuario(s)`);
  if (!nUsers) console.log('ATENCIÓN: no hay usuarios. Cree uno con: node server.js usuario <nombre> <contraseña>');
});
