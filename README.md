# Portal de inspección de daños post-sismo · Edificio KOA Apartamentos

Portal web privado, **con usuario y contraseña**, para que el ingeniero inspector registre elemento por elemento los daños del sismo del 10 de agosto de 2026 en:

- **Áreas comunes:** sótanos −1 y −2 (parqueaderos de forma global), piso 1, puntos fijos y pasillos de los pisos 2 a 11, cubierta e instalaciones.
- **Fachadas exteriores:** inspeccionadas por fuera, en paños por piso.
- **130 apartamentos:** en cada uno, el muro hacia el pasillo y el muro de fachada.
- **2 locales comerciales y 9 depósitos.**

Por cada daño se registra el tipo, la severidad, las medidas, la reparación recomendada con su cantidad de obra, el procedimiento de reparación, el comentario técnico y 1 o 2 fotos selladas. Al final se genera el **informe técnico** (PDF) y el **cuadro de cantidades** (CSV para Excel) para que los contratistas coticen.

> El portal **solo funciona desde su servidor** (`server.js`). Abierto desde otro lugar (por ejemplo, GitHub Pages) muestra “Acceso restringido”. **No es necesario activar GitHub Pages.**

---

## Instalación en exe.dev

```bash
# 1. Crear la máquina (desde tu computador)
ssh exe.dev new                      # anota el nombre, p. ej. koa-sismo

# 2. Entrar e instalar el portal
ssh koa-sismo.exe.xyz
git clone https://github.com/Fabig76/koa-inspeccion-sismo.git koa
cd koa

# 3. Crear los usuarios (las contraseñas quedan cifradas en data/users.json, nunca en GitHub)
node server.js usuario <usuario1> '<contraseña1>'
node server.js usuario <usuario2> '<contraseña2>'
history -c                           # borra las contraseñas del historial de la consola

# 4. Arrancar el portal en el puerto 8000 (el que publica exe.dev)
nohup node server.js > portal.log 2>&1 &
```

El portal queda en `https://koa-sismo.exe.xyz/`. Como ya tiene su propio inicio de sesión, puedes abrir el enlace para que el ingeniero entre sin crear cuenta en exe.dev:

```bash
ssh exe.dev share set-public koa-sismo
```

(Si prefieres doble protección, déjalo privado y comparte con `ssh exe.dev share add koa-sismo <correo>`; el ingeniero tendrá que entrar primero a exe.dev con ese correo y luego al portal con su usuario.)

### Administración de usuarios

```bash
node server.js usuarios                          # listar
node server.js usuario <nombre> '<nueva>'        # crear o cambiar contraseña (cierra sus sesiones)
node server.js borrar-usuario <nombre>           # eliminar acceso
```

Seguridad incluida: contraseñas cifradas con scrypt, sesión con cookie `HttpOnly` y `Secure` (30 días), bloqueo de 10 minutos tras 5 intentos fallidos, y registro de qué usuario hizo cada cambio.

### Arranque automático (systemd)

```bash
sudo tee /etc/systemd/system/koa.service >/dev/null <<'EOF'
[Unit]
Description=Portal KOA
After=network.target
[Service]
WorkingDirectory=/home/exedev/koa
Environment=PORT=8000
ExecStart=/usr/bin/node server.js
Restart=always
User=exedev
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now koa
```

(Ajusta `WorkingDirectory` y `User` a tu máquina; confírmalo con `whoami` y `pwd`.)

### Actualizar el portal

```bash
cd ~/koa && git pull && sudo systemctl restart koa     # o vuelve a lanzar node server.js
```

### Respaldos

Todos los datos quedan en `data/` (`state.json`, `photos/`, `users.json`). Para copiarlos a tu computador:

```bash
scp -r koa-sismo.exe.xyz:koa/data ./respaldo-koa
```

Desde el portal también se puede descargar un respaldo completo en *Inspector y datos → Sesión y respaldo*.

---

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El portal: interfaz, modelos 3D, inspección e informe |
| `login.html` | Pantalla de inicio de sesión |
| `server.js` | Servidor (Node 18+, sin dependencias): usuarios, sesiones, datos y fotos |
| `vendor/` | Librería 3D (Three.js, licencia MIT) incluida para no depender de internet |
