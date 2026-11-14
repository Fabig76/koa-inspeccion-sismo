// Receptor de respaldos del Portal KOA en Google Drive (Google Apps Script).
// Implementar como aplicación web: ejecutar como "Yo", acceso "Cualquier persona".
// Guarda los archivos en la carpeta "Respaldos portal KOA" de esta cuenta. No borra nada.
var RAIZ = 'Respaldos portal KOA';
function carpeta_(nombre) {
  var it = DriveApp.getFoldersByName(RAIZ);
  var raiz = it.hasNext() ? it.next() : DriveApp.createFolder(RAIZ);
  if (!nombre) return raiz;
  var s = raiz.getFoldersByName(nombre);
  return s.hasNext() ? s.next() : raiz.createFolder(nombre);
}
function r_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return r_({ ok: true, app: 'koa-respaldo', carpeta: RAIZ }); }
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var nombre = String(d.nombre || '').replace(/[^A-Za-z0-9._-]/g, '');
    var sub = d.carpeta === 'fotos' ? 'fotos' : 'datos';
    var f = carpeta_(sub);
    if (d.accion === 'listar') {
      var out = [], it = f.getFiles();
      while (it.hasNext()) out.push(it.next().getName());
      return r_({ ok: true, archivos: out });
    }
    if (d.accion === 'subir' && nombre) {
      if (d.unico && f.getFilesByName(nombre).hasNext()) return r_({ ok: true, existia: true });
      var blob = Utilities.newBlob(Utilities.base64Decode(d.b64), d.mime === 'image/jpeg' ? 'image/jpeg' : 'application/json', nombre);
      var file = f.createFile(blob);
      return r_({ ok: true, id: file.getId(), size: file.getSize() });
    }
    return r_({ ok: false, error: 'accion no valida' });
  } catch (err) { return r_({ ok: false, error: String(err) }); }
}
