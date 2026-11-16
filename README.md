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

| | Administrador | Inspector (ingeniero) | Captura de fachada | Consulta |
|---|---|---|---|---|
| Ver secciones, daños y fotos | ✅ | ✅ | solo fachadas | ✅ |
| Inspeccionar y registrar | ✅ | ✅ sus registros y los de captura | ✅ solo celdas de fachada | — |
| Clasificar daños levantados en fachada | ✅ | ✅ | — | — |
| Usuarios, cuadrícula de fachadas, cierre de la inspección | ✅ | — | — | — |
| Ver versiones anteriores de un registro | ✅ | — | — | — |
| Informe y cuadro de cantidades (CSV) | ✅ | ✅ | — | ✅ |
| Borrar datos del servidor | nadie | nadie | nadie | nadie |

El servidor aplica estas reglas; la página solo las refleja. Una celda de fachada que el ingeniero ya revisó queda en solo lectura para el usuario de captura.

## Fachadas: levantamiento por bajadas

- Cada fachada (`F1`…`F6`) se divide en **bajadas** (franjas verticales de un descenso en cuerda, numeradas de izquierda a derecha mirando desde afuera) y **niveles** (remate y pisos 11 a 1). Cada celda tiene un código, p. ej. `F1-B05-P08`, y cada daño el suyo, `F1-B05-P08-D1`, que se marca con tiza en el muro y queda estampado en las fotos.
- La cuadrícula (nombre, ejes, largo, número de bajadas y referencias visibles) se ajusta en **Administración → Cuadrícula de fachadas**. Los valores iniciales son aproximados, tomados de los planos.
- **Modo descenso** (botón `B01 ▼`): pantalla de botones grandes para el técnico. Por cada celda: *Sin daño* (foto), *Hay daño* (daño típico, foto general, foto de detalle con regla, posición, medidas, nota de voz) o *No se pudo revisar*.
- El ingeniero ve las celdas levantadas en **Por clasificar** y completa severidad, atribución, reparación, cantidad y comentario.
- El informe se puede generar por partes (una fachada a la vez) e incluye el **plano de daños** de cada fachada.

## Garantías de los datos

- **Versiones en el servidor** (`data/versiones.ndjson`): antes de reemplazar un registro, el servidor guarda la versión anterior completa si se quitó algo, si cambió de autor o cada 2 minutos de edición.
- **Numeración fija de fotos** (`data/fotos.json`): el número F‑0001… se asigna al llegar la foto y no cambia.
- **Control de cambios por revisión** del servidor, sin depender del reloj del celular.
- **Sin señal**: el portal abre (`sw.js`), guarda en el dispositivo y envía al recuperar la conexión. Si una foto pendiente se pierde antes de llegar, el elemento queda marcado y no se da por completo.
- **Respaldo**: `respaldo.js` deja su resultado en `data/respaldo-estado.json` y Administración avisa si falló o lleva más de 36 horas sin correr. Las notas de voz van a la carpeta `datos` de Drive con el prefijo `audio-`.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El portal (interfaz, modelos 3D, inspección, modo descenso, informe) |
| `server.js` | Servidor (Node 18+, sin dependencias) |
| `sw.js`, `manifest.webmanifest`, `icono*.png` | Aplicación instalable y apertura sin señal |
| `config.js` | Dirección del servidor para la copia de GitHub Pages |
| `respaldo.js`, `respaldo-drive.gs` | Respaldo diario a Google Drive |
| `vendor/` | Librería 3D (Three.js, MIT) incluida |
| `presentacion/` | Presentación al Consejo |
| `SPEC-v3-fachadas.md` | Especificación de la versión 3 |
| `pruebas/` | `test_v3_servidor.py` (API) y `test_v3_portal.py` (portal, con Playwright) |
| `legacy/` | Versión anterior |

## Pruebas locales

```bash
rm -rf /tmp/koadata; KOA_ADMIN='admin1:AdminPrueba123' PORT=8123 DATA_DIR=/tmp/koadata node server.js &
python3 pruebas/test_v3_servidor.py && python3 pruebas/test_v3_portal.py
```
