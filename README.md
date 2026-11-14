# Portal de inspección de daños post-sismo · Edificio KOA Apartamentos

Portal web para que el ingeniero inspector registre, elemento por elemento, los daños causados por el sismo del 10 de agosto de 2026 en:

- **Áreas comunes:** sótanos −1 y −2 (parqueaderos de forma global), piso 1, puntos fijos y pasillos de los pisos 2 a 11, cubierta e instalaciones.
- **Fachadas exteriores:** inspeccionadas por fuera, divididas en paños por piso.
- **130 apartamentos:** en cada uno, el muro hacia el pasillo y el muro de fachada.
- **2 locales comerciales y 9 depósitos.**

Para cada daño se registra el tipo, la severidad, las medidas, la reparación recomendada con su cantidad de obra, el procedimiento de reparación, el comentario técnico y 1 o 2 fotos con sello de evidencia. Al final se genera el **informe técnico** (imprimible a PDF) y el **cuadro de cantidades** (CSV para Excel) para que los contratistas coticen.

Un elemento solo cuenta como completo si tiene toda la información obligatoria. El informe final solo se emite con el 100 % completo; antes de eso sale como borrador.

---

## Opción 1 · GitHub Pages (modo local)

1. En el repositorio, ve a **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`, y guarda.
3. En uno o dos minutos el portal queda en `https://<usuario>.github.io/<repositorio>/`.

En este modo **la información se guarda en el navegador del dispositivo del ingeniero**. Para entregarla, el ingeniero usa *Inspector y datos → Descargar respaldo* y envía el archivo `.json`, que se carga en cualquier otro equipo con *Cargar respaldo*.

## Opción 2 · exe.dev (recomendado: datos centralizados)

Con el servidor incluido (`server.js`), todo lo que registre el ingeniero, datos y fotos, se guarda en tu máquina de exe.dev y lo ves en tiempo real desde cualquier dispositivo. Si el ingeniero pierde la señal dentro del edificio, el portal guarda en el teléfono y sincroniza cuando vuelve la conexión.

```bash
# 1. Crear la máquina (desde tu computador)
ssh exe.dev new                      # anota el nombre, p. ej. koa-sismo

# 2. Entrar e instalar el portal
ssh koa-sismo.exe.xyz
git clone https://github.com/<usuario>/<repositorio>.git koa
cd koa

# 3. Arrancarlo en el puerto 8000 (el que publica exe.dev), con una clave de acceso
PORTAL_TOKEN='una-clave-segura' nohup node server.js > portal.log 2>&1 &
```

El portal queda en `https://koa-sismo.exe.xyz/`. Por defecto es **privado**. Para darle acceso al ingeniero:

```bash
ssh exe.dev share add koa-sismo correo-del-ingeniero@ejemplo.com
```

Al ingeniero le llega un correo, entra con ese correo y en el portal escribe la clave (`PORTAL_TOKEN`) en *Inspector y datos → Sincronización*.

Para que el portal se reinicie solo si la máquina se reinicia, puedes crear un servicio de systemd:

```bash
sudo tee /etc/systemd/system/koa.service >/dev/null <<'EOF'
[Unit]
Description=Portal KOA
After=network.target
[Service]
WorkingDirectory=/home/exedev/koa
Environment=PORT=8000
Environment=PORTAL_TOKEN=una-clave-segura
ExecStart=/usr/bin/node server.js
Restart=always
User=exedev
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now koa
```

(Ajusta `WorkingDirectory` y `User` al usuario de tu máquina; confírmalo con `whoami` y `pwd`.)

**Respaldos:** los datos quedan en la carpeta `data/` (`state.json` y `photos/`). Para copiarlos a tu computador: `scp -r koa-sismo.exe.xyz:koa/data ./respaldo-koa`.

---

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El portal completo: interfaz, modelos 3D, inspección, informe |
| `server.js` | Servidor opcional para exe.dev (Node 18+, sin dependencias) |
| `.nojekyll` | Para que GitHub Pages publique el sitio tal cual |
