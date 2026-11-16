#!/usr/bin/env node
/*
 * Servidor del Portal de Inspección KOA · v3 (Node 18+, sin dependencias)
 *
 *  - Sirve el portal (index.html + vendor) y una API JSON.
 *  - Usuarios con rol: admin (administración), inspector (ingeniero), captura (técnico de fachada) y consulta (solo lectura). Acceso con usuario y contraseña.
 *  - Los datos (registros, perfiles, estado) y las fotos quedan en ./data (o DATA_DIR).
 *  - El inspector solo escribe sus propios registros y nunca borra nada; todo cambio queda en data/auditoria.ndjson.
 *  - CORS: la página puede servirse desde GitHub Pages (ORIGENES) o desde este mismo servidor.
 *
 *  Primer arranque (crea el administrador si no hay usuarios):
 *      KOA_ADMIN='fabig76:ContraseñaSegura' node server.js
 *  Variables: PORT (8000), DATA_DIR, ORIGENES (coma-separados, p. ej. https://fabig76.github.io)
 *  Consola:   node server.js usuario <nombre> <contraseña> [admin|inspector|captura|consulta]   ·   node server.js usuarios
 */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 8000;
const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const PHOTOS = path.join(DATA, 'photos');
const AUDIOS = path.join(DATA, 'audios');
const F = { state: path.join(DATA, 'state.json'), users: path.join(DATA, 'users.json'), sessions: path.join(DATA, 'sessions.json'), audit: path.join(DATA, 'auditoria.ndjson'), versions: path.join(DATA, 'versiones.ndjson'), fotos: path.join(DATA, 'fotos.json'), respaldo: path.join(DATA, 'respaldo-estado.json') };
const ROLES = ['admin', 'inspector', 'captura', 'consulta'];
const CELDA_RE = /^F\d{1,2}-B\d{2}-(P\d{2}|REM)$/;
const ORIGENES = (process.env.ORIGENES || 'https://fabig76.github.io').split(',').map(s => s.trim()).filter(Boolean);
const SESSION_DAYS = 30;
fs.mkdirSync(PHOTOS, { recursive: true }); fs.mkdirSync(AUDIOS, { recursive: true });

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
  role = ROLES.includes(role) ? role : (cur.role || 'inspector');
  const u = { ...cur, role, active: extra.active ?? cur.active ?? true, updatedAt: Date.now() };
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
  else { console.error('Comandos: usuario <nombre> <contraseña> [admin|inspector|captura|consulta] | usuarios'); process.exit(1); }
  process.exit(0);
}
if (!Object.keys(users).length && process.env.KOA_ADMIN) { const [n, p] = process.env.KOA_ADMIN.split(':'); setUser(n, p, 'admin'); console.log(`Administrador "${n}" creado.`); }

// ---- estado ----
let state = readJSON(F.state, { items: {}, profiles: {}, config: { locked: false } });
state.items ||= {}; state.profiles ||= {}; state.config ||= { locked: false };
let saveT = null;
function saveNow() { clearTimeout(saveT); saveT = null; writeJSON(F.state, state); }
function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 200); }
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { if (saveT) saveNow(); } catch { } process.exit(0); });
// Numeración fija de fotos: cada foto recibe su número al llegar al servidor y no cambia nunca
let fotos = readJSON(F.fotos, { n: 0, map: {} });
function numFoto(id) { if (!fotos.map[id]) { fotos.map[id] = ++fotos.n; writeJSON(F.fotos, fotos); } return fotos.map[id]; }
for (const f of fs.readdirSync(PHOTOS).filter(f => f.endsWith('.jpg')).map(f => ({ f, t: fs.statSync(path.join(PHOTOS, f)).mtimeMs })).sort((a, b) => a.t - b.t)) numFoto(f.f.slice(0, -4));
// Versiones: antes de reemplazar un registro, la versión anterior se guarda completa si se pierde algo, cambia de autor o pasó tiempo
const lastVer = {};
const refsOf = r => [...(r.fotos || []), ...(r.hallazgos || []).flatMap(h => [...(h.fotos || []), h.audio].filter(Boolean)), ...(r.audios || [])];
function pierde(cur, rec) {
  if ((cur.status || '') !== (rec.status || '')) return true;
  const nr = new Set(refsOf(rec)); if (refsOf(cur).some(x => !nr.has(x))) return true;
  const nh = new Set((rec.hallazgos || []).map(h => h.id)); if ((cur.hallazgos || []).some(h => !nh.has(h.id))) return true;
  return (cur.intentos || []).length > (rec.intentos || []).length;
}
function version(id, cur, rec, user) {
  const now = Date.now(); const lost = pierde(cur, rec);
  if (!lost && cur.lastUid === user && now - (lastVer[id] || 0) < 120e3) return;
  lastVer[id] = now;
  fs.appendFileSync(F.versions, JSON.stringify({ at: now, by: user, item: id, motivo: lost ? 'se retiró o cambió información' : 'punto de control', rec: cur }) + '\n');
}
function audit(o) { fs.appendFile(F.audit, JSON.stringify({ at: Date.now(), ...o }) + '\n', () => { }); }

// ---- utilidades HTTP ----
function cors(req, res) {
  const o = req.headers.origin;
  if (o && ORIGENES.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS'); res.setHeader('Access-Control-Max-Age', '86400'); }
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function body(req, limit) { return new Promise((resolve, reject) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > limit) { reject(new Error('Demasiado grande')); req.destroy(); } else c.push(d); }); req.on('end', () => resolve(Buffer.concat(c))); req.on('error', reject); }); }
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function sessionOf(req, url) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!t) return null;
  const s = sessions[sha(t)]; if (!s || s.exp < Date.now()) return null;
  const u = users[s.user]; if (!u || !u.active) return null;
  return { user: s.user, role: u.role };
}
const fails = new Map();
const locked = k => (fails.get(k)?.until || 0) > Date.now();
function fail(k, max = 5) { const f = fails.get(k) || { n: 0, until: 0 }; f.n++; if (f.n >= max) { f.until = Date.now() + 10 * 60e3; f.n = 0; } fails.set(k, f); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8' };
function serveFile(res, file, cache) { if (!fs.existsSync(file)) return json(res, 404, { error: 'no encontrado' }); res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache || 'no-cache', 'X-Content-Type-Options': 'nosniff' }); fs.createReadStream(file).pipe(res); }
const pubUser = (n, u) => ({ user: n, role: u.role, active: !!u.active, createdAt: u.createdAt, updatedAt: u.updatedAt });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'); const p = url.pathname;
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // ---- público ----
    if (p === '/api/health') return json(res, 200, { ok: true, app: 'koa-inspeccion', v: 3, auth: 'token', users: Object.keys(users).length > 0 });
    if (p === '/api/setup' && req.method === 'POST') {
      // Primer arranque: crea el administrador solo si aún no existe ningún usuario
      if (Object.keys(users).length) return json(res, 409, { error: 'El administrador ya existe' });
      let b; try { b = JSON.parse(await body(req, 4096)); } catch { return json(res, 400, { error: 'Solicitud inválida' }); }
      try { setUser(String(b.user || '').trim().toLowerCase(), String(b.pass || ''), 'admin'); } catch (e) { return json(res, 400, { error: e.message }); }
      audit({ ev: 'setup_admin', user: String(b.user).toLowerCase(), ip: clientIp(req) });
      return json(res, 200, { ok: true });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const ip = clientIp(req);
      let b; try { b = JSON.parse(await body(req, 4096)); } catch { return json(res, 400, { error: 'Solicitud inválida' }); }
      const name = String(b.user || '').trim().toLowerCase(), pass = String(b.pass || '');
      if (locked(ip + '|' + name) || locked(ip)) return json(res, 429, { error: 'Demasiados intentos fallidos. Espere 10 minutos.' });
      const u = users[name];
      const ok = u && u.active && crypto.timingSafeEqual(Buffer.from(hashPass(pass, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
      if (!ok) { fail(ip + '|' + name); fail(ip, 40); audit({ ev: 'login_fallido', user: name, ip }); await new Promise(r => setTimeout(r, 600)); return json(res, 401, { error: u && !u.active ? 'Usuario bloqueado por la administración' : 'Usuario o contraseña incorrectos' }); }
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
      const isViewer = me.role === 'consulta';
      // Rol de consulta: solo lectura en todo el servidor
      const isCaptura = me.role === 'captura';
      if (isViewer && !(req.method === 'GET' || p === '/api/logout')) return json(res, 403, { error: 'Acceso de consulta: solo lectura' });
      const lockedAll = !!state.config.locked && !isAdmin;
      if (p === '/api/logout' && req.method === 'POST') { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (t) { delete sessions[sha(t)]; saveSessions(); } return json(res, 200, { ok: true }); }
      if (p === '/api/me') return json(res, 200, { user: me.user, role: me.role, name: me.user, locked: !!state.config.locked });
      if (p === '/api/state' && req.method === 'GET') {
        const since = +url.searchParams.get('since') || 0;
        const now = Date.now(); const fn = +url.searchParams.get('fn') || 0;
        const items = {}; for (const [k, v] of Object.entries(state.items)) if ((v.serverAt || v.updatedAt || 0) >= since) items[k] = v;
        return json(res, 200, { now, items, profiles: state.profiles, config: state.config, fotos: Object.fromEntries(Object.entries(fotos.map).filter(([, n]) => n > fn)), roles: isViewer ? undefined : Object.fromEntries(Object.entries(users).map(([n, u]) => [n, u.role])), respaldo: isAdmin ? readJSON(F.respaldo, null) : undefined, users: isAdmin ? Object.fromEntries(Object.entries(users).map(([n, u]) => [n, pubUser(n, u)])) : undefined });
      }
      if (p === '/api/perfil' && req.method === 'PUT') {
        const d = JSON.parse(await body(req, 1e5)); const uid = isAdmin && d.uid ? String(d.uid) : me.user;
        state.profiles[uid] = { ...d, uid, updatedAt: Date.now() }; save(); return json(res, 200, { ok: true });
      }
      let m = p.match(/^\/api\/items\/([^/]+)$/);
      if (m && req.method === 'PUT') {
        if (lockedAll) return json(res, 423, { error: 'Inspección cerrada: solo lectura' });
        const id = m[1]; if (!ID_RE.test(id)) return json(res, 400, { error: 'id' });
        let rec; try { rec = JSON.parse(await body(req, 2e6)); } catch { return json(res, 400, { error: 'Registro inválido' }); }
        if (!rec || typeof rec !== 'object' || Array.isArray(rec) || !['', 'sin_dano', 'con_dano', 'no_acceso', 'no_aplica'].includes(rec.status || '')) return json(res, 400, { error: 'Registro inválido' });
        const cur = state.items[id];
        if (isCaptura && !CELDA_RE.test(id)) return json(res, 403, { error: 'El usuario de captura solo registra celdas de fachada' });
        // El ingeniero inspector puede completar lo que levantó un usuario de captura; nadie más toca registros ajenos
        const ownerRole = cur ? users[cur._uid]?.role : null;
        if (isCaptura && cur && cur.lastUid !== me.user && users[cur.lastUid]?.role !== 'captura') return json(res, 403, { error: 'Esta celda ya fue revisada por el ingeniero' });
        if (cur && !isAdmin && cur._uid !== me.user && !(me.role === 'inspector' && ownerRole === 'captura')) return json(res, 403, { error: 'Este registro pertenece a otro usuario' });
        rec._uid = cur?._uid || me.user; if (isAdmin && !cur && rec._uid) rec._uid = String(rec._uid);
        // Control de cambios por número de revisión del servidor (no depende del reloj del celular)
        if (cur && cur.lastUid !== me.user && (rec.rev || 0) !== (cur.rev || 0)) return json(res, 409, { error: 'conflicto', current: cur });
        if (cur) version(id, cur, rec, me.user);
        rec.item = id; rec.lastUid = me.user; rec.serverAt = Date.now(); rec.rev = (cur?.rev || 0) + 1;
        state.items[id] = rec; save();
        audit({ ev: 'item', user: me.user, item: id, status: rec.status, n: (rec.hallazgos || []).length, fotos: (rec.fotos || []).length + (rec.hallazgos || []).reduce((t, h) => t + (h.fotos || []).length, 0) });
        return json(res, 200, { ok: true, rev: rec.rev, serverAt: rec.serverAt });
      }
      m = p.match(/^\/api\/photos\/([^/]+)$/);
      if (m) {
        const id = m[1]; if (!ID_RE.test(id)) return json(res, 400, { error: 'id' });
        const file = path.join(PHOTOS, id + '.jpg');
        if (req.method === 'PUT') { if (lockedAll) return json(res, 423, { error: 'Inspección cerrada' }); if (fs.existsSync(file)) return json(res, 200, { ok: true, existed: true, n: numFoto(id) }); const buf = await body(req, 15e6); if (buf.length < 100 || buf[0] !== 0xFF || buf[1] !== 0xD8) return json(res, 400, { error: 'El archivo no es una foto JPEG' }); fs.writeFileSync(file, buf); const n = numFoto(id); audit({ ev: 'foto', user: me.user, id, n, bytes: buf.length, sha: sha(buf) }); return json(res, 200, { ok: true, n }); }
        if (req.method === 'GET') { if (!fs.existsSync(file)) return json(res, 404, { error: 'no existe' }); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' }); return fs.createReadStream(file).pipe(res); }
      }
      m = p.match(/^\/api\/audios\/([^/]+)$/);
      if (m) {
        const id = m[1]; if (!ID_RE.test(id)) return json(res, 400, { error: 'id' });
        const file = path.join(AUDIOS, id);
        if (req.method === 'PUT') { if (lockedAll) return json(res, 423, { error: 'Inspección cerrada' }); if (fs.existsSync(file)) return json(res, 200, { ok: true, existed: true }); const ct = String(req.headers['content-type'] || '').split(';')[0]; if (!/^audio\/[a-z0-9.+-]+$/.test(ct)) return json(res, 400, { error: 'No es un audio' }); fs.writeFileSync(file, await body(req, 8e6)); fs.writeFileSync(file + '.tipo', ct); audit({ ev: 'audio', user: me.user, id }); return json(res, 200, { ok: true }); }
        if (req.method === 'GET') { if (!fs.existsSync(file)) return json(res, 404, { error: 'no existe' }); let ct = 'audio/webm'; try { ct = fs.readFileSync(file + '.tipo', 'utf8'); } catch { } res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }); return fs.createReadStream(file).pipe(res); }
      }
      // ---- solo administrador ----
      if (!isAdmin) return json(res, 403, { error: 'Solo el administrador' });
      if (p === '/api/config' && req.method === 'PUT') { const d = JSON.parse(await body(req, 2e5));
        if ('locked' in d) { Object.assign(state.config, { locked: !!d.locked, lockedAt: d.locked ? Date.now() : null, lockedBy: me.user }); audit({ ev: d.locked ? 'cerrar' : 'reabrir', user: me.user }); }
        if (Array.isArray(d.fachadas)) {
          const fs_ = d.fachadas.slice(0, 20).map(f => ({ id: String(f.id || ''), nombre: String(f.nombre || '').slice(0, 80), ejes: String(f.ejes || '').slice(0, 60), largo: Math.max(1, Math.min(200, +f.largo || 1)), bajadas: Math.max(1, Math.min(60, Math.round(+f.bajadas || 1))), notas: (Array.isArray(f.notas) ? f.notas : []).slice(0, 60).map(x => String(x || '').slice(0, 60)) }));
          if (fs_.some(f => !/^F\d{1,2}$/.test(f.id)) || new Set(fs_.map(f => f.id)).size !== fs_.length) return json(res, 400, { error: 'Fachadas inválidas' });
          state.config.fachadas = fs_; state.config.fachadasAt = Date.now(); audit({ ev: 'fachadas', user: me.user, n: fs_.length });
        }
        saveNow(); return json(res, 200, state.config); }
      if (p === '/api/users' && req.method === 'GET') return json(res, 200, Object.fromEntries(Object.entries(users).map(([n, u]) => [n, pubUser(n, u)])));
      if (p === '/api/users' && req.method === 'POST') {
        const d = JSON.parse(await body(req, 1e4));
        try { setUser(d.user, d.pass, ROLES.includes(d.role) ? d.role : 'inspector'); } catch (e) { return json(res, 400, { error: e.message }); }
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
      m = p.match(/^\/api\/versiones\/([^/]+)$/);
      if (m) { let txt = ''; try { txt = fs.readFileSync(F.versions, 'utf8'); } catch { } const out = []; for (const l of txt.split('\n')) { if (!l || !l.includes('"item":"' + m[1] + '"')) continue; try { const v = JSON.parse(l); if (v.item === m[1]) out.push(v); } catch { } } return json(res, 200, out.slice(-200)); }
      if (p === '/api/respaldo') return json(res, 200, { app: 'koa-inspeccion', version: 2, exportedAt: Date.now(), ...state });
      return json(res, 404, { error: 'no encontrado' });
    }

    // ---- archivos del portal (públicos: la página pide usuario y contraseña) ----
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(ROOT, 'index.html'));
    if (/^\/vendor\/[A-Za-z0-9._-]+$/.test(p)) return serveFile(res, path.join(ROOT, p), 'public, max-age=86400');
    if (p === '/sw.js' || p === '/manifest.webmanifest' || p === '/icono.png' || p === '/icono-192.png') return serveFile(res, path.join(ROOT, p));
    if (p === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('window.KOA_API="";'); }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
});
server.listen(PORT, () => console.log(`Portal KOA v3 en http://localhost:${PORT} · datos en ${DATA} · ${Object.keys(users).length} usuario(s) · orígenes externos: ${ORIGENES.join(', ') || 'ninguno'}`));
