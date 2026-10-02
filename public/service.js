'use strict';
const Service=(()=>{
  const local=['localhost','127.0.0.1','::1'].includes(location.hostname);
  const demo=local&&new URLSearchParams(location.search).get('demo')==='1';
  const listeners=new Set();let db,auth,functions;
  if(!demo){firebase.initializeApp(window.FIREBASE_CONFIG);db=firebase.firestore();auth=firebase.auth();functions=firebase.app().functions(window.FUNCTIONS_REGION);if(local&&new URLSearchParams(location.search).get('emulator')==='1'){auth.useEmulator('http://127.0.0.1:9099');db.useEmulator('127.0.0.1',8080);functions.useEmulator('127.0.0.1',5001);}}
  const clone=x=>JSON.parse(JSON.stringify(x));
  function seed(){return {pedidos:{'demo-completo':{schemaVersion:2,mesaId:'mesa-1',mesa:'Mesa 1',items:[{...Rocio.CATALOG[0],quantity:3,unitPrice:400},{...Rocio.CATALOG[5],quantity:1,unitPrice:300},{...Rocio.CATALOG[8],quantity:1,unitPrice:50},{...Rocio.CATALOG[12],quantity:2,unitPrice:600}],total:2750,estado:'pendiente',fecha:new Date().toISOString(),pedidoDeSeguimiento:false},'demo-barra':{schemaVersion:2,mesaId:'silla-3',mesa:'Silla 3',items:[{...Rocio.CATALOG[0],quantity:3,unitPrice:400},{...Rocio.CATALOG[9],quantity:1,unitPrice:200}],total:1400,estado:'realizado',comidaLista:true,bebidaLista:true,fecha:new Date().toISOString()}},pagos:{},caja:{[Rocio.day()]:{efectivoInicial:10000,fechaInicio:new Date().toISOString(),cerrado:false}},stock:{},config:{menu:{products:clone(Rocio.CATALOG)}},papelera:{},auditoria:{},mesas:{}};}
  function read(){const raw=localStorage.getItem('rocio-demo-v2');const state=raw?JSON.parse(raw):seed();if(!state.config.menu.updatedAt)state.config.menu.products=clone(Rocio.CATALOG);return state;}
  function save(data){localStorage.setItem('rocio-demo-v2',JSON.stringify(data));listeners.forEach(fn=>fn());}
  if(demo){if(!localStorage.getItem('rocio-demo-v2'))save(seed());window.addEventListener('storage',()=>listeners.forEach(fn=>fn()));}
  async function call(name,data){if(!demo)return (await functions.httpsCallable(name)(data)).data;const state=read(),orders=state.pedidos;const open=mesa=>Object.values(orders).some(p=>Rocio.locationId(p)===mesa&&['pendiente','realizado'].includes(p.estado));
    if(name==='mesaEstado')return {abierta:open(data.mesaId)};
    if(name==='crearPedido'){const key=data.requestId;if(orders[key])return {id:key,total:orders[key].total};const stock={};Object.entries(state.stock).forEach(([k,v])=>stock[k]=v.disponible);const quote=Rocio.calculate(data.selection,state.config.menu.products,stock,open(data.mesaId));orders[key]={schemaVersion:2,mesaId:data.mesaId,mesa:Rocio.location(data.mesaId).label,items:quote.items,total:quote.total,estado:'pendiente',fecha:new Date().toISOString(),pedidoDeSeguimiento:open(data.mesaId),entranteLista:false,comidaLista:false,bebidaLista:false};save(state);return {id:key,total:quote.total};}
    if(name!=='adminAccion')throw Error('Acción desconocida.');
    const before=orders[data.id]?clone(orders[data.id]):null,p=orders[data.id],date=Rocio.day(),stamp=new Date().toISOString(),motive=data.motivo;
    if(['borrar','restaurar','corregir','cancelar','anularCobro','liberarMesa','cajaReabrir'].includes(data.action)&&(!motive||motive.trim().length<3))throw Error('Indica el motivo.');
    switch(data.action){
      case 'guardarCarta':state.config.menu={products:Rocio.validateCatalog(data.products),updatedAt:stamp};break;
      case 'stock':state.stock[data.productId]={disponible:data.disponible};break;
      case 'cajaAbrir':if(state.caja[date]?.cerrado)throw Error('Reabre primero la caja.');state.caja[date]={...state.caja[date],efectivoInicial:data.amount,cerrado:false,fechaInicio:stamp};break;
      case 'cajaCerrar':if(!state.caja[date]||state.caja[date].cerrado)throw Error('La caja no está abierta.');Object.assign(state.caja[date],{cerrado:true,efectivoFinal:data.amount,fechaCierre:stamp});break;
      case 'cajaReabrir':state.caja[date].cerrado=false;break;
      case 'listo':if(p.estado!=='pendiente'||!Rocio.requirements(p)[data.field])throw Error('No se puede completar esta sección.');p[data.field]=true;p[{entranteLista:'horaEntranteLista',comidaLista:'horaComidaLista',bebidaLista:'horaBebidaLista'}[data.field]]=stamp;if(Rocio.ready(p))p.estado='realizado';break;
      case 'cobrar':if(p.estado==='pagado')break;if(p.estado!=='realizado'||!Rocio.ready(p))throw Error('El pedido no está listo.');if(!state.caja[date]||state.caja[date].cerrado)throw Error('Abre la caja antes de cobrar.');Object.assign(p,{estado:'pagado',metodoPago:data.metodo,horaPagado:stamp});state.pagos[data.id]={idPedido:data.id,total:p.total,metodo:data.metodo,fecha:stamp,fechaDia:date};break;
      case 'borrar':state.papelera[data.id]={pedido:clone(p),fechaBorrado:stamp,motivo:motive};delete orders[data.id];break;
      case 'restaurar':if(orders[data.id])throw Error('El pedido ya existe.');orders[data.id]=state.papelera[data.id].pedido;delete state.papelera[data.id];break;
      case 'cancelar':if(p.estado==='pagado')throw Error('Anula el cobro primero.');p.estado='cancelado';p.motivoCancelacion=motive;break;
      case 'anularCobro':{const pays=Object.entries(state.pagos).filter(([,pay])=>pay.idPedido===data.id);if(!pays.length||p.estado!=='pagado')throw Error('No hay un cobro para anular.');if(pays.some(([,pay])=>state.caja[pay.fechaDia]?.cerrado))throw Error('La caja del cobro está cerrada.');pays.forEach(([k])=>delete state.pagos[k]);Object.assign(p,{estado:Rocio.ready(p)?'realizado':'pendiente',metodoPago:null,horaPagado:null});break;}
      case 'corregir':{if(p.estado==='pagado')throw Error('Anula el cobro antes de corregir.');const q=Rocio.calculate(data.selection,state.config.menu.products,{},true);Object.assign(p,{items:q.items,total:q.total,mesaId:data.mesaId,mesa:Rocio.location(data.mesaId).label,schemaVersion:2,estado:'pendiente',entranteLista:false,comidaLista:false,bebidaLista:false,horaEntranteLista:null,horaComidaLista:null,horaBebidaLista:null});break;}
      case 'liberarMesa':Object.values(orders).filter(p=>Rocio.locationId(p)===data.mesaId&&['pendiente','realizado'].includes(p.estado)).forEach(p=>{p.estado='cancelado';p.motivoCancelacion=motive;});break;
      default:throw Error('Acción desconocida.');
    }
    state.auditoria[crypto.randomUUID()]={action:data.action,entity:data.id||data.productId||date,uid:'demo-local',fecha:stamp,before,after:orders[data.id]||null,motivo:motive||null};save(state);return {ok:true};
  }
  function subscribe(collection,fn,onError=()=>{}){if(demo){const update=()=>fn(Object.entries(read()[collection]||{}).map(([id,data])=>({...clone(data),id})));listeners.add(update);update();return ()=>listeners.delete(update);}if(collection==='config')return db.doc('config/menu').onSnapshot(snap=>fn(snap.exists?[{...snap.data(),id:'menu'}]:[]),onError);return db.collection(collection).onSnapshot(snap=>fn(snap.docs.map(d=>({...d.data(),id:d.id}))),onError);}
  async function all(collection){if(demo)return Object.entries(read()[collection]||{}).map(([id,data])=>({...clone(data),id}));if(collection==='config'){const snap=await db.doc('config/menu').get();return snap.exists?[{...snap.data(),id:'menu'}]:[];}const result=[];let cursor;while(true){let query=db.collection(collection).orderBy(firebase.firestore.FieldPath.documentId()).limit(300);if(cursor)query=query.startAfter(cursor);const page=await query.get();result.push(...page.docs.map(d=>({...d.data(),id:d.id})));if(page.size<300)break;cursor=page.docs[page.docs.length-1];}return result;}
  async function customer(){if(demo)return;if(!auth.currentUser)await auth.signInAnonymously();}
  return {demo,call,subscribe,all,customer,auth,db,resetDemo:()=>save(seed())};
})();
