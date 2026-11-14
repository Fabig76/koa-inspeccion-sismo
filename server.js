#!/usr/bin/env node
/*
 * Servidor del Portal de Inspección KOA · v2 (Node 18+, sin dependencias)
 *
 *  - Sirve el portal (index.html + vendor) y una API JSON.
 *  - Usuarios con rol: admin (administración) e inspector. Acceso con usuario y contraseña.
 *  - Los datos (registros, perfiles, estado) y las fotos quedan en ./data (o DATA_DIR).
 *  - El inspector solo escribe sus propios registros y nunca borra nada; todo cambio queda en data/auditoria.ndjson.
 *  - CORS: la página puede servirse desde GitHub Pages (ORIGENES) o desde este mismo servidor.
 *
 *  Primer arranque (crea el administrador si no hay usuarios):
 *      KOA_ADMIN='fabig76:ContraseñaSegura' node server.js
 *  Variables: PORT (8000), DATA_DIR, ORIGENES (coma-separados, p. ej. https://fabig76.github.io)
 *  Consola:   node server.js usuario <nombre> <contraseña> [admin|inspector]   ·   node server.js usuarios
 */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 8000;
const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const PHOTOS = path.join(DATA, 'photos');
const F = { state: path.join(DATA, 'state.json'), users: path.join(DATA, 'users.json'), sessions: path.join(DATA, 'sessions.json'), audit: path.join(DATA, 'auditoria.ndjson') };
const ORIGENES = (process.env.ORIGENES || 'https://fabig76.github.io').split(',').map(s => s.trim()).filter(Boolean);
const SESSION_DAYS = 30;
fs.mkdirSync(PHOTOS, { recursive: true });

const readJSON = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const writeJSON = (f, obj) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 }); fs.renameSync(tmp, f); };
const hashPass = (pass, salt) => crypto.scryptSync(String(pass), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const USER_RE = /^[a-z0-9._-]{3,40}$/, ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

let users = readJSON(F.users, {});
let sessions = readJSON(F.sessions, {});
function saveSessions() { const now = Date.now(); for (const k in sessions) if (sessions[k].exp < now) delete sessions[k]; writeJSON(F.sessions, sessions); }
function setUser(name, pass, role = 'inspector', extra = {}) {
  name = String(name).toLowerCase();
  if (!USER_RE.test(name)) throw new Error('Nombre de usuario inválido (3-40 letras minúsculas, números, . _ -)');
  if (pass != null && String(pass).length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
  const cur = users[name] || { createdAt: Date.now() };
  const u = { ...cur, role: role || cur.role || 'inspector', active: extra.active ?? cur.active ?? true, updatedAt: Date.now() };
  if (pass != null) { u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hashPass(pass, u.salt); }
  if (!u.hash) throw new Error('Falta la contraseña');
  users[name] = u; writeJSON(F.users, users);
  if (pass != null || extra.active === false) { for (const k in sessions) if (sessions[k].user === name) delete sessions[k]; saveSessions(); }
  return u;
}

// ---- consola ----
const [cmd, a1, a2, a3] = process.argv.slice(2);
if (cmd) {
  if (cmd === 'usuario') { try { setUser(a1, a2, a3 || (users[a1]?.role) || 'inspector'); console.log(`Usuario "${a1}" guardado (${users[a1.toLowerCase()].role}).`); } catch (e) { console.error(e.message); process.exit(1); } }
  else if (cmd === 'usuarios') { const l = Object.entries(users); console.log(l.length ? l.map(([n, u]) => `${n}\t${u.role}\t${u.active ? 'activo' : 'bloqueado'}`).join('\n') : '(sin usuarios)'); }
  else { console.error('Comandos: usuario <nombre> <contraseña> [admin|inspector] | usuarios'); process.exit(1); }
  process.exit(0);
}
if (!Object.keys(users).length && process.env.KOA_ADMIN) { const [n, p] = process.env.KOA_ADMIN.split(':'); setUser(n, p, 'admin'); console.log(`Administrador "${n}" creado.`); }

// ---- estado ----
let state = readJSON(F.state, { items: {}, profiles: {}, config: { locked: false } });
state.items ||= {}; state.profiles ||= {}; state.config ||= { locked: false };
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => writeJSON(F.state, state), 200); }
function audit(o) { fs.appendFile(F.audit, JSON.stringify({ at: Date.now(), ...o }) + '\n', () => { }); }

// ---- utilidades HTTP ----
function cors(req, res) {
  const o = req.headers.origin;
  if (o && ORIGENES.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS'); res.setHeader('Access-Control-Max-Age', '86400'); }
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function body(req, limit) { return new Promise((resolve, reject) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > limit) { reject(new Error('Demasiado grande')); req.destroy(); } else c.push(d); }); req.on('end', () => resolve(Buffer.concat(c))); req.on('error', reject); }); }
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function sessionOf(req, url) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('t') || '';
  if (!t) return null;
  const s = sessions[sha(t)]; if (!s || s.exp < Date.now()) return null;
  const u = users[s.user]; if (!u || !u.active) return null;
  return { user: s.user, role: u.role };
}
const fails = new Map();
const locked = k => (fails.get(k)?.until || 0) > Date.now();
function fail(k) { const f = fails.get(k) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) { f.until = Date.now() + 10 * 60e3; f.n = 0; } fails.set(k, f); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };
function serveFile(res, file, cache) { if (!fs.existsSync(file)) return json(res, 404, { error: 'no encontrado' }); res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache || 'no-cache', 'X-Content-Type-Options': 'nosniff' }); fs.createReadStream(file).pipe(res); }
const pubUser = (n, u) => ({ user: n, role: u.role, active: !!u.active, createdAt: u.createdAt, updatedAt: u.updatedAt });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'); const p = url.pathname;
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // ---- público ----
    if (p === '/api/health') return json(res, 200, { ok: true, app: 'koa-inspeccion', v: 2, auth: 'token', users: Object.keys(users).length > 0 });
    if (p === '/api/login' && req.method === 'POST') {
      const ip = clientIp(req);
      let b; try { b = JSON.parse(await body(req, 4096)); } catch { return json(res, 400, { error: 'Solicitud inválida' }); }
      const name = String(b.user || '').trim().toLowerCase(), pass = String(b.pass || '');
      if (locked(ip + '|' + name) || locked(ip)) return json(res, 429, { error: 'Demasiados intentos fallidos. Espere 10 minutos.' });
      const u = users[name];
      const ok = u && u.active && crypto.timingSafeEqual(Buffer.from(hashPass(pass, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
      if (!ok) { fail(ip + '|' + name); fail(ip); audit({ ev: 'login_fallido', user: name, ip }); await new Promise(r => setTimeout(r, 600)); return json(res, 401, { error: u && !u.active ? 'Usuario bloqueado por la administración' : 'Usuario o contraseña incorrectos' }); }
      fails.delete(ip + '|' + name); fails.delete(ip);
      const token = crypto.randomBytes(32).toString('base64url');
      sessions[sha(token)] = { user: name, exp: Date.now() + SESSION_DAYS * 864e5, ip, at: Date.now() }; saveSessions();
      audit({ ev: 'login', user: name, ip });
      return json(res, 200, { token, user: name, role: u.role });
    }

    // ---- requiere sesión ----
    const me = sessionOf(req, url);
    if (p.startsWith('/api/')) {
      if (!me) return json(res, 401, { error: 'login' });
      const isAdmin = me.role === 'admin';
      const lockedAll = !!state.config.locked && !isAdmin;
      if (p === '/api/logout' && req.method === 'POST') { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (t) { delete sessions[sha(t)]; saveSessions(); } return json(res, 200, { ok: true }); }
      if (p === '/api/me') return json(res, 200, { user: me.user, role: me.role, name: me.user, locked: !!state.config.locked });
      if (p === '/api/state' && req.method === 'GET') {
        const since = +url.searchParams.get('since') || 0;
        const items = {}; for (const [k, v] of Object.entries(state.items)) if ((v.updatedAt || 0) > since) items[k] = v;
        return json(res, 200, { now: Date.now(), items, profiles: state.profiles, config: state.config, users: isAdmin ? Object.fromEntries(Object.entries(users).map(([n, u]) => [n, pubUser(n, u)])) : undefined });
      }
      if (p === '/api/perfil' && req.method === 'PUT') {
        const d = JSON.parse(await body(req, 1e5)); const uid = isAdmin && d.uid ? String(d.uid) : me.user;
        state.profiles[uid] = { ...d, uid, updatedAt: Date.now() }; save(); return json(res, 200, { ok: true });
      }
      let m = p.match(/^\/api\/items\/([^/]+)$/);
      if (m && req.method === 'PUT') {
        if (lockedAll) return json(res, 423, { error: 'Inspección cerrada: solo lectura' });
        const id = m[1]; if (!ID_RE.test(id)) return json(res, 400, { error: 'id' });
        const rec = JSON.parse(await body(req, 2e6));
        const cur = state.items[id];
        if (cur && !isAdmin && cur._uid !== me.user) return json(res, 403, { error: 'Este registro pertenece a otro inspector' });
        rec._uid = cur?._uid || rec._uid || me.user; rec.item = id; rec.lastUid = me.user; rec.serverAt = Date.now();
        if (!isAdmin && rec._uid !== me.user) return json(res, 403, { error: 'No puede escribir registros de otro usuario' });
        if (cur && (cur.updatedAt || 0) > (rec.updatedAt || 0) + 5000) return json(res, 409, { error: 'conflicto', current: cur });
        state.items[id] = rec; save();
        audit({ ev: 'item', user: me.user, item: id, status: rec.status, n: (rec.hallazgos || []).length, fotos: (rec.fotos || []).length + (rec.hallazgos || []).reduce((t, h) => t + (h.fotos || []).length, 0) });
        return json(res, 200, { ok: true });
      }
      m = p.match(/^\/api\/photos\/([^/]+)$/);
      if (m) {
        const id = m[1]; if (!ID_RE.test(id)) return json(res, 400, { error: 'id' });
        const file = path.join(PHOTOS, id + '.jpg');
        if (req.method === 'PUT') { if (lockedAll) return json(res, 423, { error: 'Inspección cerrada' }); if (fs.existsSync(file)) return json(res, 200, { ok: true, existed: true }); fs.writeFileSync(file, await body(req, 15e6)); audit({ ev: 'foto', user: me.user, id }); return json(res, 200, { ok: true }); }
        if (req.method === 'GET') { if (!fs.existsSync(file)) return json(res, 404, { error: 'no existe' }); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' }); return fs.createReadStream(file).pipe(res); }
      }
      // ---- solo administrador ----
      if (!isAdmin) return json(res, 403, { error: 'Solo el administrador' });
      if (p === '/api/config' && req.method === 'PUT') { const d = JSON.parse(await body(req, 1e4)); state.config = { locked: !!d.locked, lockedAt: d.locked ? Date.now() : null, lockedBy: me.user }; save(); audit({ ev: d.locked ? 'cerrar' : 'reabrir', user: me.user }); return json(res, 200, state.config); }
      if (p === '/api/users' && req.method === 'GET') return json(res, 200, Object.fromEntries(Object.entries(users).map(([n, u]) => [n, pubUser(n, u)])));
      if (p === '/api/users' && req.method === 'POST') {
        const d = JSON.parse(await body(req, 1e4));
        try { setUser(d.user, d.pass, d.role === 'admin' ? 'admin' : 'inspector'); } catch (e) { return json(res, 400, { error: e.message }); }
        audit({ ev: 'usuario_creado', user: me.user, target: String(d.user).toLowerCase(), role: d.role }); return json(res, 200, { ok: true });
      }
      m = p.match(/^\/api\/users\/([^/]+)$/);
      if (m && req.method === 'PUT') {
        const name = m[1].toLowerCase(); if (!users[name]) return json(res, 404, { error: 'no existe' });
        const d = JSON.parse(await body(req, 1e4));
        if (name === me.user && d.active === false) return json(res, 400, { error: 'No puede bloquearse a sí mismo' });
        if (d.role && name === me.user && d.role !== 'admin') return json(res, 400, { error: 'No puede quitarse el rol de administrador' });
        try { setUser(name, d.pass ?? null, d.role || users[name].role, { active: d.active }); } catch (e) { return json(res, 400, { error: e.message }); }
        audit({ ev: 'usuario_editado', user: me.user, target: name, pass: d.pass != null, active: d.active, role: d.role }); return json(res, 200, { ok: true });
      }
      if (p === '/api/auditoria') { let txt = ''; try { txt = fs.readFileSync(F.audit, 'utf8'); } catch { } const lines = txt.trim().split('\n').filter(Boolean).slice(-500).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); return json(res, 200, lines); }
      if (p === '/api/respaldo') return json(res, 200, { app: 'koa-inspeccion', version: 2, exportedAt: Date.now(), ...state });
      return json(res, 404, { error: 'no encontrado' });
    }

    // ---- archivos del portal (públicos: la página pide usuario y contraseña) ----
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(ROOT, 'index.html'));
    if (/^\/vendor\/[A-Za-z0-9._-]+$/.test(p)) return serveFile(res, path.join(ROOT, p), 'public, max-age=86400');
    if (p === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('window.KOA_API="";'); }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
});
server.listen(PORT, () => console.log(`Portal KOA v2 en http://localhost:${PORT} · datos en ${DATA} · ${Object.keys(users).length} usuario(s) · orígenes externos: ${ORIGENES.join(', ') || 'ninguno'}`));
