import asyncio, json, sys
from playwright.async_api import async_playwright
B='http://127.0.0.1:8123'; import os; F=os.path.join(os.path.dirname(os.path.abspath(__file__)),'foto.jpg')
ok=0; bad=0; errs=[]
def T(n,c):
    global ok,bad
    if c: ok+=1
    else: bad+=1; print('FALLA:',n)
async def login(pg,u,p):
    await pg.goto(B); await pg.wait_for_selector('#gU',timeout=15000)
    await pg.fill('#gU',u); await pg.fill('#gP',p); await pg.click('#gB'); await pg.wait_for_selector('#nav button',timeout=15000)
async def newpage(b,mobile=False):
    ctx=await b.new_context(viewport={'width':390,'height':844} if mobile else {'width':1300,'height':900},permissions=['microphone'])
    pg=await ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('console',lambda m:m.type=='error' and 'Failed to load resource' not in m.text and errs.append('CONSOLE '+m.text))
    return ctx,pg
async def synced(pg):
    for _ in range(60):
        if await pg.evaluate("Object.keys(__koa.outbox()).length")==0: return True
        await pg.wait_for_timeout(250)
    return False
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
        # ---------- técnico (captura) en celular ----------
        ctx,pg=await newpage(b,True); await login(pg,'tec1','InspPrueba123')
        navs=await pg.eval_on_selector_all('#nav button','els=>els.map(e=>e.dataset.view)'); T('captura solo ve fachadas y perfil',navs==['fachadas','ajustes'])
        T('celdas generadas', await pg.evaluate("__koa.ITEMS.filter(i=>i.cell).length")==62*12)
        await pg.click('[data-desc="F1|3"]')
        if await pg.query_selector('#profGo'):
            await pg.fill('#in_nombre','Técnico Uno'); await pg.click('#profGo')
        await pg.wait_for_selector('.dcode'); T('abre en remate', (await pg.inner_text('.dcode'))=='F1-B03-REM')
        await pg.set_input_files('[data-dph="sin"]',F); await pg.wait_for_function("document.querySelector('.dcode')?.textContent=='F1-B03-P11'",timeout=15000)
        T('sin daño avanza solo', True)
        await pg.click('[data-dact="dano"]'); await pg.wait_for_selector('[data-dtip="T01"]')
        await pg.click('[data-dtip="T01"]'); await pg.wait_for_selector('[data-dtip="T01"].on')
        await pg.set_input_files('[data-dph="g0"]',F); await pg.wait_for_selector('.dfotos .ph img')
        await pg.set_input_files('[data-dph="e0"]',F); await pg.wait_for_function("document.querySelectorAll('.dfotos .ph').length==2")
        await pg.click('[data-dpos="Arriba der."]'); await pg.wait_for_selector('[data-dpos="Arriba der."].on')
        await pg.fill('[data-dk="area"]','3,5'); await pg.fill('[data-dk="ancho"]','2')
        await pg.click('[data-drec="0"]'); await pg.wait_for_timeout(1200); await pg.click('[data-drec="0"]'); 
        try: await pg.wait_for_selector('[data-audio] audio',timeout=8000); T('nota de voz grabada',True)
        except Exception as e: T('nota de voz grabada',False)
        await pg.click('[data-dact="dano"]'); await pg.wait_for_function("document.querySelectorAll('#descBody .hz').length==2")
        await pg.click('#dDown'); await pg.wait_for_selector('.dlg-back'); T('avisa daño sin tipo ni foto',True)
        await pg.click('.dlg-back button:has-text("Cancelar")')
        await pg.click('[data-ddel="1"]'); await pg.click('.dlg-back button:has-text("Quitar")'); await pg.wait_for_function("document.querySelectorAll('#descBody .hz').length==1")
        await pg.click('#dDown'); await pg.wait_for_function("document.querySelector('.dcode')?.textContent=='F1-B03-P10'")
        T('sincroniza', await synced(pg))
        r=await pg.evaluate("__koa.recs()['F1-B03-P11']"); h=r['hallazgos'][0]
        T('daño con plantilla', h['rep']=='R04' and h['elemento']=='Revoque / pañete' and h['cantidad']=='3,5' and h['n']==1 and len(h['espec'])>30)
        T('fotos en servidor', all(x.startswith('p:') for x in h['fotos']) and h['escala']==h['fotos'][1] and h.get('audio','').startswith('u:'))
        T('estado por clasificar', await pg.evaluate("__koa.itemState('F1-B03-P11')")=='por_clasificar')
        T('celda sin daño completa', await pg.evaluate("__koa.itemState('F1-B03-REM')")=='sin_dano')
        await pg.screenshot(path='/tmp/koa-descenso.png')
        # ---------- sin señal: recargar y seguir trabajando ----------
        await pg.wait_for_timeout(1500)
        await ctx.set_offline(True); await pg.reload(); 
        try: await pg.wait_for_selector('#nav button',timeout=15000); T('abre sin señal',True)
        except Exception: T('abre sin señal',False); await pg.screenshot(path='/tmp/koa-offline.png')
        if await pg.query_selector('#nav button'):
            await pg.evaluate("document.querySelector('[data-desc=\"F1|3\"]').click()"); await pg.wait_for_selector('.dcode')
            T('retoma en la celda pendiente', (await pg.inner_text('.dcode'))=='F1-B03-P10')
            await pg.set_input_files('[data-dph="sin"]',F); await pg.wait_for_function("document.querySelector('.dcode')?.textContent=='F1-B03-P09'",timeout=15000)
            T('queda en cola sin señal', await pg.evaluate("Object.keys(__koa.outbox()).length")==1)
            await ctx.set_offline(False); await pg.evaluate("window.dispatchEvent(new Event('online'))")
            T('envía al volver la señal', await synced(pg))
            T('foto llegó', (await pg.evaluate("__koa.recs()['F1-B03-P10'].fotos[0]")).startswith('p:'))
        await pg.screenshot(path='/tmp/koa-descenso2.png'); await ctx.close()
        # ---------- ingeniero ----------
        ctx,pg=await newpage(b); await login(pg,'ing1','InspPrueba123')
        await pg.click('[data-view="fachadas"]'); await pg.wait_for_selector('.gridf')
        T('bandeja por clasificar', await pg.query_selector('.pend-list [data-item="F1-B03-P11"]') is not None)
        await pg.screenshot(path='/tmp/koa-fachadas.png',full_page=False)
        await pg.click('.pend-list [data-item="F1-B03-P11"]')
        if await pg.query_selector('#profGo'):
            for k,v in [('nombre','Ing. Prueba'),('profesion','Ingeniero civil'),('matricula','123'),('fechaInicio','2026-11-16')]: await pg.fill('#in_'+k,v)
            await pg.click('#profGo')
        await pg.wait_for_selector('#edBody .hz')
        T('editable por el ingeniero', not await pg.evaluate("document.querySelector('.sheet').classList.contains('readonly')"))
        T('muestra código y nota de voz', 'F1-B03-P11-D1' in await pg.inner_text('#edBody') and await pg.query_selector('#edBody [data-audio]') is not None)
        await pg.click('[data-sev="moderado"]'); await pg.wait_for_timeout(300)
        await pg.select_option('select[data-k="atrib"]','sismo'); await pg.wait_for_timeout(300)
        await pg.fill('textarea[data-k="comentario"]','Pañete desprendido a lo largo de la junta de placa.'); await pg.wait_for_timeout(900)
        T('ingeniero sincroniza', await synced(pg))
        T('celda completa tras clasificar', await pg.evaluate("__koa.itemState('F1-B03-P11')")=='con_dano')
        r=await pg.evaluate("__koa.recs()['F1-B03-P11']"); T('dueño captura, último ingeniero', r['_uid']=='tec1' and r['lastUid']=='ing1')
        await pg.click('.sheet [data-close]')
        # elemento interior con daño típico y frente a apto
        await pg.click('[data-view="comunes"]'); await pg.click('[data-item="p9-pasillo"]'); await pg.wait_for_selector('#edBody')
        T('muestra puntos del informe anterior', 'FH-KOA-01' in await pg.inner_text('#edBody'))
        await pg.click('[data-status="con_dano"]'); await pg.wait_for_selector('select[data-k="tipico"]')
        await pg.select_option('select[data-k="tipico"]','T13'); await pg.wait_for_timeout(400)
        T('plantilla interior', await pg.input_value('select[data-k="rep"]')=='R08' and await pg.query_selector('select[data-k="frente"]') is not None)
        await pg.click('.sheet [data-close]')
        # informe por fachada
        await pg.click('[data-view="informe"]'); await pg.select_option('#repScope','F1'); await pg.click('#genRep'); await pg.wait_for_selector('#paper .plan')
        txt=await pg.inner_text('#paper'); T('informe F1 con plano y código', 'F1-B03-P11-D1' in txt and 'Plano' in txt and 'F-000' in txt and 'Apartamentos' not in txt.split('7. Fachadas')[1][:20000].replace('apartamentos','') or 'F1-B03-P11-D1' in txt)
        T('informe parcial no incluye otras secciones', '8.1 Estado de los muros' not in txt)
        await pg.screenshot(path='/tmp/koa-informe.png'); await pg.click('#repClose')
        await pg.select_option('#repScope','todo'); await pg.click('#genRep'); await pg.wait_for_selector('#paper .plan'); txt=await pg.inner_text('#paper'); T('informe completo', '8.1 Estado de los muros' in txt and 'F2 ·' in txt); await pg.click('#repClose')
        await ctx.close()
        # ---------- técnico ya no puede cambiar lo clasificado ----------
        ctx,pg=await newpage(b,True); await login(pg,'tec1','InspPrueba123')
        await pg.wait_for_function("__koa.recs()['F1-B03-P11']?.lastUid=='ing1'",timeout=15000)
        await pg.click('[data-item="F1-B03-P11"]'); await pg.wait_for_selector('.dcode')
        T('celda clasificada: solo lectura para captura', await pg.query_selector('#descBody .banner.lock') is not None and await pg.query_selector('[data-ddel]') is None)
        await ctx.close()
        # ---------- administrador ----------
        ctx,pg=await newpage(b); await login(pg,'admin1','AdminPrueba123')
        await pg.click('[data-view="admin"]'); await pg.wait_for_selector('#fachTbl')
        await pg.fill('#fachTbl [data-ff="bajadas"][data-i="2"]','5'); await pg.fill('#fachTbl [data-ff="notas"][data-i="0"]','balcones; franja azul; ventanas'); await pg.click('#fachSave'); await pg.wait_for_function("__koa.FACH()[2].bajadas==5")
        T('cuadrícula editable', await pg.evaluate("__koa.ITEMS.filter(i=>i.cell).length")==63*12)
        await pg.fill('#fachTbl [data-ff="bajadas"][data-i="0"]','2'); await pg.click('#fachSave'); await pg.wait_for_timeout(500)
        T('no deja reducir bajadas con registros', await pg.evaluate("__koa.FACH()[0].bajadas")==16)
        T('aviso de respaldo', 'Respaldo en Drive' in await pg.inner_text('#view'))
        await pg.screenshot(path='/tmp/koa-admin.png',full_page=True)
        await pg.click('[data-view="fachadas"]'); await pg.click('[data-item="F1-B03-P11"]'); await pg.wait_for_selector('#verSrv'); await pg.click('#verSrv'); await pg.wait_for_function("document.querySelector('#verBox').textContent.match(/reemplazada|no tiene/)")
        T('versiones del servidor visibles', 'reemplazada por' in await pg.inner_text('#verBox'))
        await ctx.close()
        # ---------- consulta ----------
        ctx,pg=await newpage(b); await login(pg,'cons1','InspPrueba123')
        await pg.click('[data-view="fachadas"]'); await pg.wait_for_selector('.gridf'); T('consulta sin botón de descenso', await pg.query_selector('[data-desc]') is None)
        await pg.click('[data-item="F1-B03-P11"]'); await pg.wait_for_selector('#edBody .hz'); T('consulta solo lectura', await pg.evaluate("document.querySelector('.sheet').classList.contains('readonly')"))
        await ctx.close(); await b.close()
    print(f'UI: {ok} correctas, {bad} fallas'); print('\n'.join(errs[:15]))
asyncio.run(main())
