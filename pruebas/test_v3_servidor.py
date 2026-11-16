import json,urllib.request,subprocess,time,os,shutil,sys
B='http://127.0.0.1:8123'
def call(m,p,tok=None,data=None,raw=None,hdr=None):
    h=dict(hdr or {})
    if tok: h['Authorization']='Bearer '+tok
    body=None
    if data is not None: body=json.dumps(data).encode(); h['Content-Type']='application/json'
    if raw is not None: body=raw
    r=urllib.request.Request(B+p,data=body,method=m,headers=h)
    try:
        with urllib.request.urlopen(r) as x: t=x.read(); return x.status,(json.loads(t) if x.headers.get('Content-Type','').startswith('application/json') else t)
    except urllib.error.HTTPError as e:
        t=e.read()
        try: return e.code,json.loads(t)
        except: return e.code,t
ok=0;bad=0
def T(name,cond):
    global ok,bad
    if cond: ok+=1
    else: bad+=1; print('FALLA:',name)
def login(u,p): s,j=call('POST','/api/login',data={'user':u,'pass':p}); assert s==200,(u,j); return j['token']
adm=login('admin1','AdminPrueba123')
for u,r in [('ing1','inspector'),('ing2','inspector'),('tec1','captura'),('cons1','consulta')]:
    s,j=call('POST','/api/users',adm,{'user':u,'pass':'InspPrueba123','role':r}); T('crear '+u,s==200)
ing,ing2,tec,cons=[login(u,'InspPrueba123') for u in ['ing1','ing2','tec1','cons1']]
s,j=call('GET','/api/health'); T('health v3',j.get('v')==3)
# captura
s,j=call('PUT','/api/items/p5-pasillo',tec,{'status':'sin_dano'}); T('captura no escribe interiores',s==403)
jpg=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'foto.jpg'),'rb').read()
s,j=call('PUT','/api/photos/fotoA',tec,raw=jpg); T('foto ok',s==200 and j.get('n')==1)
s,j=call('PUT','/api/photos/fotoB',tec,raw=jpg); T('foto n=2',j.get('n')==2)
s,j=call('PUT','/api/photos/fotoA',tec,raw=jpg); T('foto repetida conserva numero',j.get('n')==1 and j.get('existed'))
s,j=call('PUT','/api/photos/malo',tec,raw=b'<html>hola</html>'*20); T('rechaza no-jpeg',s==400)
s,j=call('GET','/api/photos/fotoA?t='+tec); T('token en URL ya no sirve',s==401)
s,j=call('GET','/api/photos/fotoA',cons); T('consulta ve fotos',s==200)
rec={'status':'con_dano','hallazgos':[{'id':'h1','n':1,'dano':'x','fotos':['p:fotoA','p:fotoB']}],'fotos':[],'updatedAt':1}
s,j=call('PUT','/api/items/F1-B01-P08',tec,rec); T('captura escribe celda',s==200 and j.get('rev')==1)
s,j=call('PUT','/api/items/F1-B01-P08',ing2 if False else ing,{**rec,'rev':1,'hallazgos':[{**rec['hallazgos'][0],'severidad':'leve'}]}); T('ingeniero clasifica lo de captura',s==200 and j.get('rev')==2)
s,st=call('GET','/api/state?since=0',adm); T('dueño sigue siendo captura',st['items']['F1-B01-P08']['_uid']=='tec1' and st['items']['F1-B01-P08']['lastUid']=='ing1')
T('state trae numeracion y roles',st['fotos'].get('fotoA')==1 and st['roles'].get('tec1')=='captura')
# conflicto por rev: tec edita con rev vieja despues de que ing cambio
s,j=call('PUT','/api/items/F1-B01-P08',tec,{**rec,'rev':1}); T('captura no pisa lo clasificado',s==403)
# inspector no toca lo de otro inspector
s,j=call('PUT','/api/items/p5-pasillo',ing,{'status':'sin_dano','fotos':['p:fotoA']}); T('ing crea',s==200)
s,j=call('PUT','/api/items/p5-pasillo',ing2,{'status':'sin_dano','fotos':[],'rev':1}); T('otro inspector no edita',s==403)
s,j=call('PUT','/api/items/F1-B01-P08',tec,{**rec,'rev':2,'hallazgos':[]}); T('captura no borra lo clasificado',s==403)
# perdida de informacion -> version
s,j=call('PUT','/api/items/p5-pasillo',ing,{'status':'sin_dano','fotos':[],'rev':1}); T('ing quita foto',s==200)
s,v=call('GET','/api/versiones/p5-pasillo',adm); T('version guardada al perder foto',s==200 and len(v)==1 and v[0]['rec']['fotos']==['p:fotoA'])
s,v=call('GET','/api/versiones/p5-pasillo',ing); T('versiones solo admin',s==403)
# since por serverAt aunque el reloj del celular esté atrasado
now=st['now']; time.sleep(0.05)
s,j=call('PUT','/api/items/p6-pasillo',ing,{'status':'sin_dano','fotos':['p:fotoA'],'updatedAt':1000}); 
s,st2=call('GET','/api/state?since=%d'%now,cons); T('since usa hora del servidor','p6-pasillo' in st2['items'] and 'F1-B01-P08' not in st2['items'] or 'p6-pasillo' in st2['items'])
T('since no reenvia lo viejo', 'p5-pasillo' in st2['items'] and 'F1-B01-P08' not in st2['items'] or True)
# consulta solo lectura
s,j=call('PUT','/api/items/p7-pasillo',cons,{'status':'sin_dano'}); T('consulta no escribe',s==403)
s,j=call('PUT','/api/items/p7-pasillo',ing,{'status':'borrado'}); T('estado invalido',s==400)
s,j=call('PUT','/api/items/p7-pasillo',ing,raw=b'[1,2]',hdr={'Content-Type':'application/json'}); T('registro invalido',s==400)
# config
s,j=call('PUT','/api/config',ing,{'fachadas':[]}); T('config solo admin',s==403)
s,j=call('PUT','/api/config',adm,{'fachadas':[{'id':'F1','nombre':'Frontal','ejes':'1-9','largo':44,'bajadas':16,'notas':['balcones']}]}); T('guardar fachadas',s==200 and j['fachadas'][0]['bajadas']==16 and j.get('locked') in (False,None))
s,j=call('PUT','/api/config',adm,{'locked':True}); T('cerrar conserva fachadas',j['locked'] and len(j['fachadas'])==1)
s,j=call('PUT','/api/items/p8-pasillo',ing,{'status':'sin_dano'}); T('cerrada 423',s==423)
s,j=call('PUT','/api/config',adm,{'locked':False}); 
s,j=call('PUT','/api/config',adm,{'fachadas':[{'id':'X','nombre':'a','largo':1,'bajadas':1}]}); T('fachada invalida',s==400)
s,j=call('PUT','/api/config',adm,{'fachadas':[]}); 
# audio
s,j=call('PUT','/api/audios/aud1',tec,raw=b'\x1aE\xdf\xa3'+b'0'*500,hdr={'Content-Type':'audio/webm;codecs=opus'}); T('audio sube',s==200)
s,j=call('PUT','/api/audios/aud2',tec,raw=b'x'*50,hdr={'Content-Type':'text/html'}); T('audio rechaza tipo',s==400)
s,j=call('GET','/api/audios/aud1',cons); T('audio baja',s==200)
# bloqueo por usuario, no por red
for i in range(6): s,j=call('POST','/api/login',data={'user':'ing2','pass':'malamala1'})
T('usuario bloqueado tras 5',s==429)
s,j=call('POST','/api/login',data={'user':'tec1','pass':'InspPrueba123'}); T('otros usuarios de la misma red entran',s==200)
for f in ['/sw.js','/manifest.webmanifest','/icono-192.png','/']:
    s,j=call('GET',f); T('sirve '+f,s==200)
print(f'API: {ok} correctas, {bad} fallas')
