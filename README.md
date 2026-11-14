# Portal de inspección de daños post-sismo · Edificio KOA Apartamentos

Portal privado para que el ingeniero inspector registre, elemento por elemento, los daños del sismo del 10 de agosto de 2026 en áreas comunes, fachadas (por fuera, piso por piso), los dos muros de cada uno de los 130 apartamentos que lindan con zonas comunes, 2 locales y 9 depósitos. Al final genera el informe técnico y el cuadro de cantidades para que los contratistas coticen.

## Arquitectura

- **Servidor (`server.js`)** en el VPS de exe.dev: usuarios con rol (administrador / inspector), acceso con usuario y contraseña, registros, fotos, cierre de la inspección y auditoría. Todo queda en la carpeta `data/`.
- **Página (`index.html`)**: se abre desde GitHub Pages (`https://fabig76.github.io/koa-inspeccion-sismo/`) o directamente desde el servidor. Cada registro y foto se envía al servidor en el momento; si no hay señal, queda en cola en el dispositivo y se envía al recuperarla. El administrador ve los cambios en segundos.
- `config.js` indica a la página de GitHub Pages dónde está el servidor.

## Instalación en exe.dev (una sola vez)

Desde tu computador:

```bash
ssh exe.dev new                                   # crea la máquina; anota el nombre, p. ej. koa-sismo
ssh koa-sismo.exe.xyz                             # entra a la máquina
git clone https://github.com/Fabig76/koa-inspeccion-sismo.git koa && cd koa
KOA_ADMIN='fabig76:TU_CONTRASEÑA' ORIGENES='https://fabig76.github.io' nohup node server.js > portal.log 2>&1 &
exit
ssh exe.dev share set-public koa-sismo            # el portal ya pide usuario y contraseña
```

El portal queda en `https://koa-sismo.exe.xyz/`. Entra con el usuario administrador y crea al ingeniero en **Administración → Usuarios y acceso**.

Dirección oficial: `https://inspeccion.bytracking.net` (CNAME a `koa-sismo.exe.xyz`, registrado en exe.dev; máquina pública). La copia de GitHub Pages apunta a ese dominio (archivo `config.js`). La máquina `koa-sismo` se creó el 14/11/2026 y corre como servicio `koa` (systemd).

### Arranque automático al reiniciar la máquina

```bash
sudo tee /etc/systemd/system/koa.service >/dev/null <<'EOF'
[Unit]
Description=Portal KOA
After=network.target
[Service]
WorkingDirectory=/home/exedev/koa
Environment=PORT=8000
Environment=ORIGENES=https://fabig76.github.io
ExecStart=/usr/bin/node server.js
Restart=always
User=exedev
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now koa
```
(Ajusta `WorkingDirectory` y `User` con `pwd` y `whoami`.)

### Mantenimiento

```bash
cd ~/koa && git pull && sudo systemctl restart koa     # actualizar el portal
node server.js usuarios                                 # listar usuarios
node server.js usuario fabig76 'NuevaContraseña' admin  # cambiar contraseña desde consola
scp -r koa-sismo.exe.xyz:koa/data ./respaldo-koa         # copiar todos los datos y fotos a tu computador
```

## Respaldo diario a Google Drive

`respaldo.js` corre cada noche (2:30 a. m., hora de Colombia) desde `/etc/cron.d/koa-respaldo`. Sube a la carpeta de Drive indicada una copia fechada de los datos (`koa-inspeccion/koa-AAAA-MM-DD.json`) y solo las fotos nuevas (`koa-inspeccion/fotos/`). No borra nada. El resultado queda en `respaldo.log`.

El destino se configura en `/etc/koa-respaldo.env` con `DRIVE_WEBHOOK`, la dirección `/exec` del receptor `respaldo-drive.gs` implementado como aplicación web de Apps Script en la cuenta de Google de destino (guarda en la carpeta "Respaldos portal KOA"). No requiere llaves. Para verificar: `set -a; . /etc/koa-respaldo.env; node respaldo.js --prueba`.

## Roles

| | Administrador | Inspector | Consulta |
|---|---|---|---|
| Ver todas las secciones, daños y fotos | ✅ | ✅ | ✅ |
| Inspeccionar y registrar | ✅ | ✅ (solo sus registros) | — |
| Crear / bloquear usuarios, cambiar contraseñas | ✅ | — | — |
| Cerrar / reabrir la inspección | ✅ | — | — |
| Ver historial y reabrir elementos | ✅ | — | — |
| Informe y cuadro de cantidades (CSV) | ✅ | ✅ | ✅ |
| Copia de seguridad y auditoría | ✅ | — | — |
| Borrar datos del servidor | nadie | nadie | nadie |

El rol **Consulta** es para empresas cotizantes, miembros del consejo o la interventoría. El servidor rechaza cualquier escritura de ese rol.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El portal (interfaz, modelos 3D, inspección, informe) |
| `server.js` | Servidor (Node 18+, sin dependencias) |
| `config.js` | Dirección del servidor para la copia de GitHub Pages |
| `respaldo.js` | Respaldo diario a Google Drive |
| `vendor/` | Librería 3D (Three.js, MIT) incluida |
| `SPEC-correcciones-v2.md` | Especificación de la versión 2 |
| `pruebas/` | Pruebas automatizadas (Playwright): `test_rest.py` (servidor), `test_local.py`, `test_v2.py` |
| `legacy/` | Versión anterior |

## Pruebas locales

```bash
KOA_ADMIN='fabig76:AdminPrueba123' ORIGENES=http://127.0.0.1:8100 PORT=8500 node server.js &
python3 pruebas/test_rest.py
```
