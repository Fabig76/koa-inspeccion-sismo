// Simulación de window.claude para pruebas locales. ROLE y UID se inyectan.
(() => {
  const ROLE = window.__MOCK_ROLE || 'owner'; const UID = window.__MOCK_UID || 'u_owner'; const NAME = window.__MOCK_NAME || 'Usuario Prueba';
  const isOwner = ROLE === 'owner', canEdit = ROLE !== 'viewer';
  const canWrite = path => isOwner || (ROLE === 'editor' && (path.startsWith('registros/' + UID + '/') || path === 'perfiles/' + UID));
  const err = (code, message) => Object.assign(new Error(message), { code });
  const J = async r => { if (!r.ok) throw err('unavailable', 'net'); return r.json(); };
  const docRef = path => ({
    id: path.split('/').pop(), path,
    async get() { const j = await J(await fetch('/__doc?path=' + encodeURIComponent(path))); return { id: path.split('/').pop(), exists: j.exists, data: () => j.data, metadata: { fromCache: false, hasPendingWrites: false } }; },
    async set(data) { if (!canWrite(path)) throw err('invalid_argument', 'permission'); await J(await fetch('/__doc?path=' + encodeURIComponent(path), { method: 'PUT', body: JSON.stringify(data) })); },
    async update(data) { const cur = await this.get(); if (!cur.exists) throw err('invalid_argument', 'missing'); return this.set({ ...cur.data(), ...data }); },
    async delete() { if (!canWrite(path)) throw err('invalid_argument', 'permission'); await fetch('/__doc?path=' + encodeURIComponent(path), { method: 'DELETE' }); },
    onSnapshot(next, error) { let last = null, alive = true; const tick = async () => { if (!alive) return; try { const j = await J(await fetch('/__doc?path=' + encodeURIComponent(path))); const s = JSON.stringify(j); if (s !== last) { last = s; next({ id: path.split('/').pop(), exists: j.exists, data: () => j.data, metadata: { fromCache: false, hasPendingWrites: false } }); } } catch (e) { } if (alive) setTimeout(tick, 700); }; tick(); return () => { alive = false; }; },
    collection(sub) { return colRef(path + '/' + sub); }
  });
  const colRef = path => {
    const q = { path, _lim: 1000, limit(n) { return { ...q, _lim: n }; }, where() { return q; }, orderBy() { return q; },
      doc(id) { return docRef(path + '/' + (id || ('d' + Math.random().toString(36).slice(2)))); },
      async add(d) { const r = q.doc(); await r.set(d); return r; },
      async get() { const j = await J(await fetch('/__db?col=' + encodeURIComponent(path))); const docs = Object.entries(j).map(([k, v]) => ({ id: k.split('/').pop(), exists: true, data: () => v, metadata: { fromCache: false, hasPendingWrites: false } })); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; },
      onSnapshot(next, error) { let last = null, alive = true; const tick = async () => { if (!alive) return; try { const j = await J(await fetch('/__db?col=' + encodeURIComponent(path))); const s = JSON.stringify(j); if (s !== last) { last = s; const docs = Object.entries(j).map(([k, v]) => ({ id: k.split('/').pop(), exists: true, data: () => v, metadata: { fromCache: false, hasPendingWrites: false } })); next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }); } } catch (e) { } if (alive) setTimeout(tick, 700); }; tick(); return () => { alive = false; }; } };
    return q;
  };
  const caps = {
    user: { async me() { return { id: UID, name: NAME, avatarUrl: '', color: '#888', email: null, isOwner, canEdit }; }, async id() { return UID; }, async isOwner() { return isOwner; }, async canEdit() { return canEdit; }, async can() { return null; }, async profiles(ids) { const o = {}; [].concat(ids).forEach(i => o[i] = { id: i, name: i === UID ? NAME : '', avatarUrl: '', color: '#888', email: null, isMe: i === UID, guest: false }); return o; } },
    db: ROLE === 'viewer' ? null : { doc: docRef, collection: colRef },
    assets: (ROLE === 'viewer') ? null : { async upload(blob) { const id = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join(''); await fetch('/_blob/' + id, { method: 'PUT', body: blob }); window.__uploads = (window.__uploads || 0) + 1; return { id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: 'image/jpeg' }; }, async list() { return { assets: [], usage: { files: 0, bytes: 0, maxFiles: 1000, maxBytes: 1e9 } }; }, async delete() { return { deleted: false }; } },
    downloads: { async save({ filename, data }) { window.__downloads = (window.__downloads || []); const size = typeof data === 'string' ? data.length : data.size; window.__downloads.push({ filename, size }); return { status: 'saved' }; } }
  };
  window.claude = { use: async name => { await new Promise(r => setTimeout(r, 50)); return caps[name] ?? null; } };
})();
