import sys, json, time
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8400/'
MOCK = open('/home/claude/tests/mock_claude.js').read()
errs = []
def ctx_for(b, role, uid, name, **kw):
    c = b.new_context(viewport=kw.get('vp', {'width': 1440, 'height': 900}), color_scheme=kw.get('scheme', 'light'))
    c.add_init_script(f"window.__MOCK_ROLE='{role}';window.__MOCK_UID='{uid}';window.__MOCK_NAME='{name}';")
    c.add_init_script(MOCK)
    pg = c.new_page()
    pg.on('pageerror', lambda e: errs.append(f'{role}: {e}'))
    pg.on('console', lambda m: errs.append(f'{role} console: {m.text}') if m.type == 'error' and 'favicon' not in m.text and '_blob' not in m.text else None)
    return c, pg
def fill_profile(pg, nombre):
    pg.fill('#in_nombre', nombre); pg.fill('#in_profesion', 'Ingeniero civil'); pg.fill('#in_matricula', '63202-1'); pg.fill('#in_fechaInicio', '2026-11-16'); pg.fill('#in_equipos', 'fisurómetro, dron')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    # ---- Sin plataforma (GitHub Pages) ----
    c0 = b.new_context(); p0 = c0.new_page(); p0.goto(BASE, wait_until='load'); time.sleep(1)
    print('sin plataforma →', p0.inner_text('#gate h1')); c0.close()
    # ---- Visitante sin acceso ----
    cv, pv = ctx_for(b, 'viewer', 'u_view', 'Visitante'); pv.goto(BASE, wait_until='load'); time.sleep(1.5)
    print('viewer →', pv.inner_text('#gate h1')); cv.close()
    # ---- Inspector (editor invitado) ----
    ci, pi = ctx_for(b, 'editor', 'u_ing', 'Ing. Carlos Ruiz'); pi.goto(BASE, wait_until='load'); time.sleep(3)
    print('inspector nav tiene Admin?:', 'Administración' in pi.inner_text('#nav'))
    pi.screenshot(path='v2_1_inicio_insp.png')
    # Bug P3: tocar apto sin perfil → hoja de perfil, luego continúa al apto
    pi.click('[data-view=aptos]'); time.sleep(2); pi.click('[data-apt="503"]'); time.sleep(1)
    print('hoja al tocar apto sin perfil:', pi.inner_text('.sheet-h b'))
    pi.screenshot(path='v2_2_perfil_gate.png')
    fill_profile(pi, 'Ing. Carlos Ruiz'); pi.click('#profGo'); time.sleep(3)
    print('tras guardar perfil, hoja:', pi.inner_text('.sheet-h b'))
    # muro pasillo sin daño + foto desde galería
    pi.click('[data-status=sin_dano]'); time.sleep(.5)
    pi.set_input_files('input[data-addph=gen]:not([capture])', '/home/claude/tests/test1.jpg'); time.sleep(3)
    print('pasillo completo:', bool(pi.query_selector('.okbox')), '| okbox:', pi.inner_text('.okbox')[:60])
    # muro fachada con daño
    pi.click('[data-wall=fachada]'); time.sleep(1); pi.click('[data-status=con_dano]'); time.sleep(.5)
    pi.select_option('select[data-h="0"][data-k=elemento]', 'Muro de mampostería'); time.sleep(.4)
    pi.select_option('select[data-h="0"][data-k=dano]', 'Fisura / grieta diagonal'); time.sleep(.4)
    pi.click('[data-sev=moderado][data-h="0"]'); time.sleep(.4)
    pi.select_option('select[data-h="0"][data-k=atrib]', 'sismo'); time.sleep(.4)
    pi.fill('input[data-h="0"][data-k=ubicacion]', 'Esquina superior derecha de la ventana'); pi.fill('input[data-h="0"][data-k=ancho]', '1,5'); pi.fill('input[data-h="0"][data-k=longitud]', '2,4'); time.sleep(.8)
    pi.select_option('select[data-h="0"][data-k=rep]', 'R03'); time.sleep(.8)
    pi.fill('textarea[data-h="0"][data-k=espec]', 'Abrir en V, limpiar, puente de adherencia, malla y mortero; estucar y pintar el paño completo.')
    pi.fill('textarea[data-h="0"][data-k=comentario]', 'Fisura diagonal a 45° desde la esquina de la ventana, atraviesa revoque y mampostería.'); time.sleep(.8)
    pi.set_input_files('input[data-addph=h0]:not([capture])', ['/home/claude/tests/test1.jpg', '/home/claude/tests/test2.jpg']); time.sleep(4)
    iss = pi.inner_text('#issuesBox'); print('falta escala?:', 'escala' in iss)
    pi.click('.esc[data-escala=h0]'); time.sleep(2)
    print('fachada completa:', bool(pi.query_selector('.okbox')))
    pi.evaluate("document.querySelector('.sheet-b').scrollTop=600"); time.sleep(.5); pi.screenshot(path='v2_3_dano.png')
    # Sin acceso con intentos
    pi.click('.sheet-f [data-close]'); time.sleep(1); pi.click('[data-apt="701"]'); time.sleep(2)
    pi.click('[data-status=no_acceso]'); time.sleep(.5)
    pi.fill('#intNota', 'Se llamó al propietario, no contestó; aviso en portería'); pi.click('#addInt'); time.sleep(1)
    print('definitivo deshabilitado con 1 intento:', pi.is_disabled('input[data-k=definitivo]'))
    pi.fill('#intNota', 'Segunda visita, nadie en casa; carta bajo la puerta'); pi.click('#addInt'); time.sleep(1)
    pi.check('input[data-k=definitivo]'); time.sleep(1.5)
    print('estado 701 pasillo:', pi.evaluate("__koa.recs()['a701-pasillo'].definitivo"), '|', pi.inner_text('[data-wall=pasillo] small'))
    pi.screenshot(path='v2_4_sin_acceso.png')
    pi.click('.sheet-f [data-close]'); time.sleep(2)
    print('inspector outbox pendiente:', pi.evaluate("Object.keys(__koa.outbox()).length"), '| uploads:', pi.evaluate("window.__uploads||0"))
    print('pill:', pi.inner_text('#syncpill'))
    # ---- Administrador en otro dispositivo ve los datos en tiempo real ----
    ca, pa = ctx_for(b, 'owner', 'u_owner', 'Fabián (admin)', scheme='dark'); pa.goto(BASE, wait_until='load'); time.sleep(4)
    st = pa.evaluate("(()=>{const s=__koa.stats();return [s.done,s.con,s.noaccdef,s.fotos]})()")
    print('admin ve (done,con,noaccdef,fotos):', st)
    print('admin nav tiene Admin?:', 'Administración' in pa.inner_text('#nav'))
    pa.click('[data-view=admin]'); time.sleep(1.5); pa.screenshot(path='v2_5_admin.png')
    print('inspectores listados:', 'Carlos Ruiz' in pa.inner_text('#view'))
    # admin abre el apto 503 y ve fotos del servidor
    pa.click('[data-view=aptos]'); time.sleep(2); pa.click('[data-apt="503"]'); time.sleep(2.5)
    pa.click('[data-wall=fachada]'); time.sleep(2.5)
    print('fotos cargadas en admin (px):', pa.evaluate("[...document.querySelectorAll('.ph img')].map(i=>i.naturalWidth)"))
    print('historial visible para admin:', bool(pa.query_selector('details.blk')))
    pa.click('.sheet-f [data-close]'); time.sleep(1)
    # Cerrar inspección
    pa.click('[data-view=admin]'); time.sleep(1); pa.click('#lock'); time.sleep(.5); pa.click('.dlg [data-r="1"]'); time.sleep(2)
    print('admin ve cerrada:', 'cerrada' in pa.inner_text('#view').lower())
    # inspector queda en solo lectura
    time.sleep(2); pi.click('[data-view=aptos]'); time.sleep(1.5); pi.click('[data-apt="504"]'); time.sleep(2)
    print('inspector readonly:', pi.evaluate("document.querySelector('.sheet').classList.contains('readonly')"), '|', pi.inner_text('#roBanner')[:50])
    pi.screenshot(path='v2_6_readonly.png'); pi.click('.sheet-f [data-close]'); time.sleep(.5)
    # admin reabre
    pa.click('#unlock'); time.sleep(2.5)
    pi.click('[data-apt="504"]'); time.sleep(2); print('inspector tras reabrir readonly?:', pi.evaluate("document.querySelector('.sheet').classList.contains('readonly')")); pi.click('.sheet-f [data-close]')
    # Informe + descargas
    pa.click('[data-view=informe]'); time.sleep(1); pa.click('#csvQ'); time.sleep(1); pa.click('#genRep'); time.sleep(3)
    pa.screenshot(path='v2_7_informe.png')
    pa.click('#repDl'); time.sleep(6)
    print('descargas admin:', pa.evaluate("window.__downloads"))
    html_ok = pa.evaluate("document.querySelectorAll('#paper img').length")
    print('imgs en informe:', html_ok)
    # inspector no puede escribir registro de otro: simulate owner record edit attempt by inspector -> owner writes item first
    pa.click('#repClose'); pa.click('[data-view=comunes]'); time.sleep(1); pa.click('[data-item="cub-placa"]'); time.sleep(1.5)
    if not pa.query_selector('#in_nombre'):
        pass
    else:
        fill_profile(pa, 'Fabián Admin'); pa.click('#profGo'); time.sleep(2)
    pa.click('[data-status=no_aplica]'); time.sleep(.4); pa.fill('textarea[data-k=nota]', 'Prueba de registro del administrador'); time.sleep(1.5); pa.click('.sheet-f [data-close]'); time.sleep(3)
    pi.click('[data-view=comunes]'); time.sleep(2); pi.click('[data-item="cub-placa"]'); time.sleep(1.5)
    print('inspector sobre registro del admin → readonly:', pi.evaluate("document.querySelector('.sheet').classList.contains('readonly')"))
    pi.click('.sheet-f [data-close]')
    # móvil
    cm, pm = ctx_for(b, 'editor', 'u_ing', 'Ing. Carlos Ruiz', vp={'width': 390, 'height': 844}); pm.goto(BASE, wait_until='load'); time.sleep(3)
    pm.click('[data-view=aptos]'); time.sleep(1.5); pm.click('[data-apt="503"]'); time.sleep(2.5); pm.screenshot(path='v2_8_movil.png')
    b.close()
print('ERRORES:', json.dumps(errs, ensure_ascii=False, indent=1))
