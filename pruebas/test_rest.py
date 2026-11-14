import time, json, sys
from playwright.sync_api import sync_playwright
SRV = 'http://127.0.0.1:8500/'      # página servida por el propio servidor
GH = 'http://127.0.0.1:8100/'       # página servida desde otro origen (GitHub Pages) con config.js → servidor
errs = []
def mk(b, vp=None):
    c = b.new_context(viewport=vp or {'width': 1440, 'height': 900}); pg = c.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('console', lambda m: errs.append('console: ' + m.text[:160]) if m.type == 'error' and 'favicon' not in m.text and '401' not in m.text else None)
    return c, pg
def login(pg, u, p):
    pg.fill('#gU', u); pg.fill('#gP', p); pg.click('#gB'); time.sleep(3)
def fill_profile(pg, nombre):
    pg.fill('#in_nombre', nombre); pg.fill('#in_profesion', 'Ingeniero civil'); pg.fill('#in_matricula', '63202-9'); pg.fill('#in_fechaInicio', '2026-11-16')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    # --- Admin desde el servidor ---
    ca, pa = mk(b); pa.goto(SRV, wait_until='load'); time.sleep(2)
    print('gate servidor:', pa.is_visible('#gateForm'))
    login(pa, 'fabig76', 'mala'); print('error:', pa.inner_text('#gE'))
    login(pa, 'fabig76', 'AdminPrueba123')
    print('admin:', pa.inner_text('#userLabel').replace('\n', ' ')[:60], '| pill:', pa.inner_text('#syncpill'))
    pa.click('[data-view=admin]'); time.sleep(1.5)
    pa.fill('#nuUser', 'ingeniero'); pa.fill('#nuPass', 'InspPrueba123'); pa.click('#nuAdd'); time.sleep(2)
    print('usuario creado:', 'ingeniero' in pa.inner_text('#view'))
    pa.screenshot(path='rest_1_admin_users.png')
    # --- Inspector desde GitHub Pages (otro origen) ---
    ci, pi = mk(b); pi.goto(GH, wait_until='load'); time.sleep(2.5)
    print('gate github:', pi.is_visible('#gateForm'))
    login(pi, 'ingeniero', 'InspPrueba123')
    print('inspector:', pi.inner_text('#userLabel').replace('\n', ' ')[:40], '| admin nav?', 'Administración' in pi.inner_text('#nav'))
    pi.click('[data-view=aptos]'); time.sleep(2); pi.click('[data-apt="503"]'); time.sleep(1)
    print('gate perfil:', pi.inner_text('.sheet-h b')); fill_profile(pi, 'Ing. Carlos Ruiz'); pi.click('#profGo'); time.sleep(3)
    pi.click('[data-status=sin_dano]'); time.sleep(.5); pi.set_input_files('input[data-addph=gen]:not([capture])', '/home/claude/tests/test1.jpg'); time.sleep(5)
    print('pasillo ok:', bool(pi.query_selector('.okbox')), '|', pi.inner_text('.okbox')[:50] if pi.query_selector('.okbox') else '')
    pi.click('[data-wall=fachada]'); time.sleep(1); pi.click('[data-status=con_dano]'); time.sleep(.5)
    pi.select_option('select[data-h="0"][data-k=elemento]', 'Muro de mampostería'); pi.select_option('select[data-h="0"][data-k=dano]', 'Fisura / grieta diagonal'); time.sleep(.5)
    pi.click('[data-sev=moderado][data-h="0"]'); time.sleep(.4); pi.select_option('select[data-h="0"][data-k=atrib]', 'sismo'); time.sleep(.4)
    pi.fill('input[data-h="0"][data-k=longitud]', '2,4'); time.sleep(.6); pi.select_option('select[data-h="0"][data-k=rep]', 'R03'); time.sleep(.8)
    pi.fill('textarea[data-h="0"][data-k=espec]', 'Abrir en V, limpiar, puente de adherencia, malla y mortero; estucar y pintar.'); pi.fill('textarea[data-h="0"][data-k=comentario]', 'Fisura diagonal a 45° desde la esquina de la ventana, atraviesa el revoque.'); time.sleep(.8)
    pi.set_input_files('input[data-addph=h0]:not([capture])', ['/home/claude/tests/test1.jpg', '/home/claude/tests/test2.jpg']); time.sleep(6)
    pi.click('.esc[data-escala=h0]'); time.sleep(3)
    print('fachada ok:', bool(pi.query_selector('.okbox')), '| outbox:', pi.evaluate("Object.keys(__koa.outbox()).length"), '| pill:', pi.inner_text('#syncpill'))
    pi.click('.sheet-f [data-close]'); time.sleep(1)
    # --- Admin ve los datos (sondeo cada 10 s) ---
    time.sleep(12)
    st = pa.evaluate("(()=>{const s=__koa.stats();return [s.done,s.con,s.fotos]})()"); print('admin ve (done,con,fotos):', st)
    pa.click('[data-view=aptos]'); time.sleep(1.5); pa.click('[data-apt="503"]'); time.sleep(2); pa.click('[data-wall=fachada]'); time.sleep(3)
    print('fotos del servidor en admin (px):', pa.evaluate("[...document.querySelectorAll('.ph img')].map(i=>i.naturalWidth)"))
    pa.screenshot(path='rest_2_admin_ve.png'); pa.click('.sheet-f [data-close]'); time.sleep(.5)
    # --- Admin cierra; inspector queda solo lectura ---
    pa.click('[data-view=admin]'); time.sleep(1); pa.click('#lock'); time.sleep(.5); pa.click('.dlg [data-r="1"]'); time.sleep(2)
    time.sleep(11); pi.click('[data-view=aptos]'); time.sleep(1.5); pi.click('[data-apt="504"]'); time.sleep(2)
    print('inspector readonly tras cierre:', pi.evaluate("document.querySelector('.sheet').classList.contains('readonly')")); pi.click('.sheet-f [data-close]')
    pa.click('#unlock'); time.sleep(2)
    # --- Informe y CSV desde admin ---
    pa.click('[data-view=informe]'); time.sleep(1)
    with pa.expect_download() as d1: pa.click('#csvQ')
    print('csv:', d1.value.suggested_filename)
    pa.click('#genRep'); time.sleep(3)
    with pa.expect_download() as d2: pa.click('#repDl')
    path = '/tmp/' + d2.value.suggested_filename; d2.value.save_as(path); html = open(path, encoding='utf-8').read()
    print('informe:', d2.value.suggested_filename, 'KB', len(html) // 1024, '| fotos embebidas:', html.count('data:image/jpeg'))
    pa.click('#repClose'); time.sleep(.5)
    # --- Admin bloquea al inspector: su sesión deja de servir ---
    pa.click('[data-view=admin]'); time.sleep(1); pa.click('[data-utoggle=ingeniero]'); time.sleep(.5); pa.click('.dlg [data-r="1"]'); time.sleep(2)
    print('bloqueado en lista:', 'Bloqueado' in pa.inner_text('#view'))
    time.sleep(12); print('inspector tras bloqueo → gate:', pi.is_visible('#gateForm') or 'login' in pi.url)
    ci2, pi2 = mk(b); pi2.goto(GH, wait_until='load'); time.sleep(2.5); login(pi2, 'ingeniero', 'InspPrueba123'); print('intento de entrada bloqueado:', pi2.inner_text('#gE'))
    # --- Salir ---
    pa.click('#logoutTop'); time.sleep(2); print('admin tras salir gate:', pa.is_visible('#gateForm'))
    b.close()
print('ERRORES:', json.dumps(errs, ensure_ascii=False, indent=1))
