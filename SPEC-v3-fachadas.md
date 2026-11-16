# Portal KOA · versión 3 — levantamiento de fachadas y correcciones de auditoría

Noviembre de 2026. Motivo: el diagnóstico anterior (FH-KOA-01) reunió 250 fotos sin ubicación y cantidades en porcentajes, por lo que no permite cotizar. La fachada se levanta con personal descolgado en cuerda.

## 1. Fachada por celdas
- Código de celda `F<fachada>-B<bajada>-P<piso>|REM`; código de daño `…-D<n>` (número permanente).
- Cuadrícula inicial desde planos: F1 frontal eje H (44 m, 16 bajadas), F2 lateral derecha eje 9 (42 m, 15), F3 testero norte eje A (11 m, 4), F4 interior ala 7–9 (31 m, 11), F5 interior ala 1–7 (33 m, 12), F6 testero occidental eje 1 (11 m, 4). 62 bajadas × 12 niveles = 744 celdas. Medidas aproximadas; se ajustan en Administración.
- Modo descenso para el rol `captura`; estado `por clasificar` hasta que el ingeniero completa el registro.
- Daños típicos (T01–T14) con elemento, tipo, reparación y procedimiento sugerido.
- Área de la celda (ancho de franja × 2,75 m) para cotizar pintura por paño completo (R22).

## 2. Correcciones de la auditoría
| # | Falla | Corrección |
|---|---|---|
| 1 | Huellas de contraseñas en el repositorio | Se retiró el acceso local y sus huellas del código vigente (siguen en el historial de git) |
| 2 | Historial solo en el celular | Versiones completas en el servidor |
| 3 | No abría sin señal | Service worker y arranque con sesión guardada |
| 4 | Foto pendiente perdida en silencio | Verificación en el servidor; si falta, aviso y elemento incompleto |
| 5 | Sincronización por reloj del celular | `since` por hora del servidor y control por revisión |
| 6 | Un registro con error bloqueaba la cola | Cada registro se envía por separado |
| 7 | Numeración de fotos variable | Número fijo asignado por el servidor |
| 8 | Informe único muy pesado | Informe por partes y fotos con carga diferida |
| 9 | Sello con hora de carga | Sello con hora de captura del archivo |
| 10 | Respaldo sin aviso de falla | Estado del respaldo visible en Administración |
| 11 | Llave de sesión en la dirección de las fotos | Fotos y audios con cabecera de autorización |
| 12 | Bloqueo por red | Bloqueo por usuario; por red solo tras 40 intentos |

## 3. Inventario
Pasillos de pisos 2 a 11 divididos en muros, cielorraso y puerta de emergencia; cubierta según lo existente; 5 reparaciones nuevas (R19–R23); puntos a verificar del informe anterior en cada elemento. Total: 1.088 elementos.
