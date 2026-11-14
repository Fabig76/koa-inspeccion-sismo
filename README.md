# Portal de inspección de daños post-sismo · Edificio KOA Apartamentos

Portal privado para que el ingeniero inspector registre, elemento por elemento, los daños del sismo del 10 de agosto de 2026 en áreas comunes, fachadas (por fuera, piso por piso), los dos muros de cada uno de los 130 apartamentos que lindan con zonas comunes, 2 locales y 9 depósitos. Al final genera el informe técnico y el cuadro de cantidades para que los contratistas coticen.

## Dónde está publicado

El portal corre como **aplicación de Claude**, con base de datos y almacenamiento de fotos en el servidor y acceso controlado por el administrador (dueño del artefacto). El enlace lo tiene el administrador en claude.ai. Este repositorio guarda el código fuente; la dirección de GitHub Pages solo muestra "Acceso restringido".

- Todo lo que registra el inspector llega al servidor en el momento; si pierde la señal, queda en una cola del dispositivo y se envía al recuperar la conexión.
- El administrador invita al inspector desde **Compartir → invitar por correo como Editor**, y puede retirarle el acceso cuando quiera. No se debe activar el enlace público.
- Solo el administrador puede **cerrar la inspección** (solo lectura para los demás), reabrir elementos, ver el historial de cambios y exportar.
- El inspector solo escribe sus propios registros. Nada se borra del servidor: quitar una foto o un daño queda en el historial.

La especificación completa de esta versión está en `SPEC-correcciones-v2.md`.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El portal completo (interfaz, modelos 3D, inspección, informe). Requiere la plataforma de Claude (`claude.use`). |
| `vendor/` | Librería 3D (Three.js, licencia MIT) incluida para no depender de internet. |
| `SPEC-correcciones-v2.md` | Especificación de la versión 2 (problemas, decisiones, reglas de acceso). |
| `pruebas/` | Simulador de la plataforma y prueba automatizada de extremo a extremo (Playwright). |
| `legacy/` | Versión anterior con servidor Node propio (exe.dev) y acceso por contraseña. Ya no se usa. |

## Cómo se republica una nueva versión

El portal se publica desde Claude con `publish_files` (index.html + vendor) sobre el mismo artefacto; las capacidades declaradas son `db` (reglas por rol), `user` (perfil), `assets` (subida para contribuyentes) y `downloads`.

## Pruebas locales

```bash
python3 pruebas/mockserver.py . 8400 &      # sirve el portal y simula base de datos y fotos
python3 pruebas/test_v2.py                   # recorre el flujo: inspector, administrador, cierre, informe
```
