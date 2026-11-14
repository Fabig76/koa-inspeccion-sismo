# Spec de correcciones v2 · Portal de inspección KOA

**Fecha:** 14 de noviembre de 2026
**Meta del proyecto:** que la inspección post-sismo quede completa, soportada con evidencia y cuantificada, para calcular correctamente la indemnización y que los contratistas coticen sin volver a visitar.

## 1. Problemas que corrige esta versión

| # | Problema detectado | Origen |
|---|---|---|
| P1 | Los datos y fotos quedaban solo en el celular del ingeniero. El administrador no los veía hasta recibir un respaldo. | Requerimiento del administrador |
| P2 | El administrador no controlaba el acceso: cualquiera con la contraseña podía borrar registros, y el ingeniero podía borrar datos después de registrarlos. | Requerimiento del administrador |
| P3 | Al tocar un apartamento sin haber registrado los datos del inspector, el portal lo mandaba a "Inspector y datos" y perdía el apartamento que quería llenar. | Error reportado |
| P4 | El botón de foto abría solo la cámara: no se podían cargar fotos de dron o cámara aparte. | Auditoría (crítico 3) |
| P5 | Un apartamento que nunca diera acceso impedía cerrar la inspección al 100 %. | Auditoría (crítico 4) |
| P6 | No quedaba constancia de si cada daño es atribuible al sismo. | Auditoría (importante 5) |
| P7 | Máximo 2 fotos por daño y sin numeración para citarlas en el informe. | Auditoría (importante 6) |
| P8 | En sótanos y estructura, la ubicación del daño era texto libre. | Auditoría (importante 7) |

## 2. Decisión de plataforma

GitHub Pages es una página estática: no puede recibir ni guardar datos. Para cumplir P1 y P2 sin que el administrador ejecute comandos, el portal se publica como **aplicación de Claude** con tres capacidades:

- **Base de datos (`db`)** en tiempo real: cada registro llega al servidor en el momento en que se guarda y el administrador lo ve de inmediato desde cualquier dispositivo.
- **Almacenamiento de archivos (`assets`)**: cada foto se sube al servidor; el portal guarda solo su identificador.
- **Identidad (`user`)**: el portal sabe quién es el dueño (administrador) y quién es un invitado (inspector). No hay contraseñas propias: el acceso lo controla el administrador con el botón **Compartir** de Claude y lo puede retirar en cualquier momento.

El repositorio de GitHub se conserva como fuente del código. La dirección de GitHub Pages pasa a mostrar "Acceso restringido".

## 3. Modelo de datos (servidor)

```
perfiles/<uid>                  Datos profesionales del inspector (nombre, profesión, matrícula…)
registros/<uid>/items/<itemId>  Registro de inspección de un elemento, hecho por ese inspector
config/estado                   Estado de la inspección: { locked, lockedAt, lockedBy }
```

Cada registro incluye un **historial** (últimos 25 cambios: fecha, usuario, acción, y el contenido de lo que se eliminó), de modo que el administrador puede ver y recuperar lo que un inspector haya modificado o quitado.

## 4. Reglas de acceso

| Ruta | Lee | Escribe |
|---|---|---|
| `registros` (todos) | todos los admitidos | solo el dueño |
| `registros/<propio>` | — | el propio inspector |
| `perfiles` / `perfiles/<propio>` | todos | dueño / el propio |
| `config` | todos | solo el dueño |

Consecuencias:
- El inspector solo puede escribir **sus propios** registros; no puede tocar los de otro inspector ni los del administrador.
- Solo el administrador puede **cerrar la inspección** (`config/estado.locked`). Cerrada, el portal queda en solo lectura para todos menos el administrador.
- El portal **nunca borra fotos del servidor** ni documentos completos. Quitar una foto o un daño solo lo desvincula y queda registrado en el historial con su contenido.
- El administrador puede retirar el acceso del inspector desde Compartir; desde ese momento no puede leer ni escribir nada.

Límite conocido: un invitado con nivel Editor podría, con conocimientos técnicos, saltarse la interfaz. El historial, el cierre y la posibilidad de retirar el acceso mitigan ese riesgo; además Claude puede leer la base de datos del artefacto en cualquier momento para auditarla.

## 5. Cambios funcionales

### 5.1 Sincronización (P1)
- Al guardar: el registro se escribe en el servidor de inmediato. Las fotos se suben primero y el registro guarda sus identificadores.
- Sin señal (sótanos): el cambio queda en una **cola de envío** del dispositivo, visible en la barra lateral ("3 cambios por enviar"). Se envía solo al volver la conexión. Una vez enviado, la foto local se elimina del dispositivo.
- El administrador ve los cambios en tiempo real, sin recargar.
- "Cargar respaldo" y "Borrar datos" desaparecen. Queda solo "Limpiar caché de este dispositivo", que no afecta al servidor.

### 5.2 Roles (P2)
- **Administrador (dueño):** todo lo del inspector, más el panel **Administración**: cerrar/abrir inspección, lista de inspectores con avance, actividad reciente, reabrir un elemento, exportar JSON y CSV, generar informe.
- **Inspector (invitado):** inspecciona y edita sus propios registros mientras la inspección esté abierta. No puede borrar documentos ni fotos del servidor, ni cerrar/abrir la inspección, ni ver el panel de administración.

### 5.3 Flujo de apartamento (P3)
- Nunca se redirige. Si el inspector abre un elemento sin tener perfil, se abre una hoja "Complete sus datos profesionales" con botón **Guardar y continuar**, que al guardar abre el elemento que había tocado.

### 5.4 Fotos (P4, P7)
- Dos botones: **Cámara** y **Galería**.
- Hasta **4 fotos por daño** y 2 generales por elemento. Para fisuras y grietas se pide marcar al menos una foto como **detalle con escala** (regla o fisurómetro); si falta, el elemento queda incompleto.
- Cada foto recibe un número consecutivo (F-0001…) en el informe, y conserva el sello de fecha, ubicación e inspector.

### 5.5 Sin acceso (P5)
- En "Sin acceso" se registran **intentos** (fecha, hora, forma de notificación).
- Con **2 o más intentos documentados** el inspector puede marcar "Sin acceso definitivo": el elemento cuenta como cerrado y el informe lo lista con sus intentos.

### 5.6 Atribución (P6)
- Campo obligatorio por daño: **Atribuible al sismo / Preexistente agravado por el sismo / No atribuible al sismo / Indeterminado**, con justificación obligatoria si no es "atribuible".
- El cuadro de cantidades separa lo atribuible de lo demás.

### 5.7 Ubicación por ejes (P8)
- Campo "Eje / referencia" con los ejes estructurales del edificio (A–H y 1–9) para sótanos, estructura y cubierta; texto libre para el resto.

### 5.8 Otros
- Campo "Atendido por" en apartamentos, locales y depósitos.
- Equipos utilizados en el perfil del inspector; aparecen en la metodología del informe.
- El informe se **descarga como archivo HTML** con las fotos incluidas (la plataforma no permite imprimir desde la página); se abre en el navegador y se guarda como PDF con Imprimir. CSV de cantidades y de detalle por descarga.
- Se eliminan `alert/confirm/prompt` (no permitidos en la plataforma) y se reemplazan por diálogos propios.

## 6. Qué no cambia
Inventario de 385 elementos, reglas de completitud, informe borrador vs final, modelos 3D, modo claro/oscuro, catálogo de daños y reparaciones.

## 7. Pasos para el administrador
1. Abrir el enlace del artefacto (ya es el dueño).
2. **Compartir → invitar por correo** al ingeniero como **Editor** (es el nivel que permite escribir a una persona de fuera de la organización). No activar enlace público.
3. Registrar sus propios datos solo si él mismo va a inspeccionar; si no, dejar que el ingeniero registre los suyos.
4. Al terminar: **Administración → Cerrar inspección**, generar el informe y los CSV.
5. Para retirar el acceso del ingeniero: Compartir → quitar.
