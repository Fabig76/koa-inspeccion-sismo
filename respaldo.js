#!/usr/bin/env node
/*
 * Respaldo del Portal KOA a Google Drive (Node 18+, sin dependencias).
 *
 * Cada ejecución:
 *   1. Sube a la carpeta de Drive una copia fechada de los datos: koa-AAAA-MM-DD.json
 *      (registros, perfiles, estado, usuarios sin contraseñas, auditoría).
 *   2. Sube a la subcarpeta "fotos" solo las fotos que aún no estén en Drive.
 *   No borra nada en Drive ni en el servidor.
 *
 * Variables (en /etc/koa-respaldo.env):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH   credenciales OAuth de la cuenta de Google
 *   DRIVE_CARPETA                                            id de la carpeta de Drive de destino
 *   DATA_DIR (opcional, ./data)
 *   O bien, sin llaves: DRIVE_WEBHOOK = dirección /exec del receptor en Apps Script (respaldo-drive.gs)
 *   de la cuenta de Google de destino.
 *
 * Uso:  node respaldo.js            ·  node respaldo.js --prueba   (solo verifica acceso a Drive)
 */
const fs = require('fs'), path = require('path');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH, DRIVE_CARPETA, DRIVE_WEBHOOK } = process.env;
const OAUTH = process.env.GOOGLE_OAUTH_URL || 'https://oauth2.googleapis.com/token';
const API = process.env.GOOGLE_API_URL || 'https://www.googleapis.com';

function log(...a) { console.log(new Date().toISOString(), ...a); }
async function token() {
  const r = await fetch(OAUTH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: GOOGLE_REFRESH, grant_type: 'refresh_token' }) });
  const j = await r.json(); if (!r.ok || !j.access_token) throw new Error('No se obtuvo acceso a Google: ' + (j.error_description || j.error || r.status));
  return j.access_token;
}
async function api(tok, method, url, body, headers = {}) {
  const r = await fetch(API + url, { method, headers: { Authorization: 'Bearer ' + tok, ...headers }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Drive ${method} ${url.split('?')[0]}: ${r.status} ${j.error?.message || ''}`);
  return j;
}
const q = s => encodeURIComponent(s);
async function list(tok, folder, extra = '') {
  const out = []; let page = '';
  do {
    const j = await api(tok, 'GET', `/drive/v3/files?q=${q(`'${folder}' in parents and trashed=false${extra}`)}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000${page ? '&pageToken=' + page : ''}`);
    out.push(...(j.files || [])); page = j.nextPageToken || '';
  } while (page);
  return out;
}
async function folder(tok, parent, name) {
  const f = (await list(tok, parent, ` and mimeType='application/vnd.google-apps.folder' and name='${name}'`))[0];
  if (f) return f.id;
  return (await api(tok, 'POST', '/drive/v3/files?fields=id', JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }), { 'Content-Type': 'application/json' })).id;
}
async function upload(tok, parent, name, buf, mime) {
  const b = 'koa' + Date.now();
  const meta = JSON.stringify({ name, parents: [parent] });
  const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--`)]);
  return api(tok, 'POST', '/upload/drive/v3/files?uploadType=multipart&fields=id,size', body, { 'Content-Type': `multipart/related; boundary=${b}` });
}
function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }

// ---- Modo receptor (Apps Script en la cuenta de destino) ----
async function hook(d) {
  const r = await fetch(DRIVE_WEBHOOK, { method: 'POST', body: JSON.stringify(d), redirect: 'follow' });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { throw new Error('Respuesta no válida del receptor de Drive (' + r.status + ')'); }
  if (!j.ok) throw new Error('Receptor de Drive: ' + j.error); return j;
}
async function viaWebhook() {
  if (process.argv.includes('--prueba')) { const r = await fetch(DRIVE_WEBHOOK, { redirect: 'follow' }); const j = await r.json(); log(`Receptor de Drive responde: carpeta "${j.carpeta}"`); return; }
  const users = readJSON(path.join(DATA, 'users.json'), {});
  let auditoria = ''; try { auditoria = fs.readFileSync(path.join(DATA, 'auditoria.ndjson'), 'utf8'); } catch { }
  const copia = { app: 'koa-inspeccion', respaldo: new Date().toISOString(), state: readJSON(path.join(DATA, 'state.json'), {}), usuarios: Object.fromEntries(Object.entries(users).map(([n, u]) => [n, { role: u.role, active: u.active }])), auditoria };
  const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
  const r = await hook({ accion: 'subir', carpeta: 'datos', nombre: `koa-${dia}.json`, mime: 'application/json', b64: Buffer.from(JSON.stringify(copia)).toString('base64') });
  log(`Datos subidos: koa-${dia}.json (${r.size} bytes)`);
  const enDrive = new Set((await hook({ accion: 'listar', carpeta: 'fotos' })).archivos);
  const dir = path.join(DATA, 'photos'); let nuevas = 0;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith('.jpg') || enDrive.has(f)) continue;
    await hook({ accion: 'subir', carpeta: 'fotos', unico: true, nombre: f, mime: 'image/jpeg', b64: fs.readFileSync(path.join(dir, f)).toString('base64') }); nuevas++;
  }
  log(`Fotos nuevas subidas: ${nuevas} · ya estaban en Drive: ${enDrive.size}`);
}

(async () => {
  if (DRIVE_WEBHOOK) return viaWebhook();
  const faltan = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH', 'DRIVE_CARPETA'].filter(k => !process.env[k]);
  if (faltan.length) { console.error('Falta DRIVE_WEBHOOK (o las variables ' + faltan.join(', ') + ')'); process.exit(2); }
  const tok = await token();
  if (process.argv.includes('--prueba')) { const f = await api(tok, 'GET', `/drive/v3/files/${DRIVE_CARPETA}?fields=id,name`); log(`Acceso correcto a la carpeta de Drive "${f.name}"`); return; }
  const base = await folder(tok, DRIVE_CARPETA, 'koa-inspeccion');
  const fotosId = await folder(tok, base, 'fotos');
  // 1) datos del día
  const users = readJSON(path.join(DATA, 'users.json'), {});
  let auditoria = ''; try { auditoria = fs.readFileSync(path.join(DATA, 'auditoria.ndjson'), 'utf8'); } catch { }
  const copia = { app: 'koa-inspeccion', respaldo: new Date().toISOString(), state: readJSON(path.join(DATA, 'state.json'), {}), usuarios: Object.fromEntries(Object.entries(users).map(([n, u]) => [n, { role: u.role, active: u.active }])), auditoria };
  const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
  const r = await upload(tok, base, `koa-${dia}.json`, Buffer.from(JSON.stringify(copia)), 'application/json');
  log(`Datos subidos: koa-${dia}.json (${r.size} bytes)`);
  // 2) fotos nuevas
  const enDrive = new Set((await list(tok, fotosId)).map(f => f.name));
  const dir = path.join(DATA, 'photos'); let nuevas = 0;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith('.jpg') || enDrive.has(f)) continue;
    await upload(tok, fotosId, f, fs.readFileSync(path.join(dir, f)), 'image/jpeg'); nuevas++;
  }
  log(`Fotos nuevas subidas: ${nuevas} · ya estaban en Drive: ${enDrive.size}`);
})().catch(e => { console.error(new Date().toISOString(), 'ERROR respaldo:', e.message); process.exit(1); });
