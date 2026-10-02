'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createHash}=require('crypto');
const R=require('./core');
initializeApp();
const db=getFirestore();
const options={region:'asia-northeast1',maxInstances:10};
const now=()=>new Date().toISOString();
const fail=(message,code='failed-precondition')=>{throw new HttpsError(code,message);};
const id=(value)=>{if(typeof value!=='string'||! /^[A-Za-z0-9_-]{1,160}$/.test(value)) fail('Identificador inválido.','invalid-argument'); return value;};
const reason=(value)=>{if(typeof value!=='string'||value.trim().length<3||value.length>500) fail('Indica el motivo (3–500 caracteres).','invalid-argument');return value.trim();};
function authenticated(req) { if(!req.auth) fail('Inicia sesión.','unauthenticated'); return req.auth.uid; }
async function administrator(req) { const uid=authenticated(req); if(!(await db.doc(`admins/${uid}`).get()).exists) fail('No tienes permisos de administración.','permission-denied'); return uid; }
function audit(tx,uid,action,entity,before=null,after=null,motive=null) { tx.set(db.collection('auditoria').doc(),{uid,action,entity,before,after,motivo:motive,fecha:now()}); }
async function menu(tx) { const snap=await tx.get(db.doc('config/menu'));return snap.exists?R.validateCatalog(snap.data().products):R.CATALOG; }
async function openOrders(tx,mesaId) {
  R.location(mesaId);
  const newer=await tx.get(db.collection('pedidos').where('mesaId','==',mesaId));
  const older=await tx.get(db.collection('pedidos').where('mesa','in',R.aliases(mesaId)));
  const docs=new Map(); [...newer.docs,...older.docs].forEach(d=>{if(['pendiente','realizado'].includes(d.data().estado)) docs.set(d.id,d);});
  return [...docs.values()];
}
function touchMesa(tx,mesaId) { if(mesaId) tx.set(db.doc(`mesas/${mesaId}`),{updatedAt:now()}, {merge:true}); }
function callable(fn) { return onCall(options,async req=>{try{return await fn(req);}catch(e){if(e instanceof HttpsError) throw e; if(e instanceof Error && /inválid|producto|pedido|taco|carta|Cantidad|Añade|Completa|Identificador|Categoría|Los tacos|ubicación/i.test(e.message)) throw new HttpsError('invalid-argument',e.message); console.error(e);throw new HttpsError('internal','No se pudo guardar el cambio. Vuelve a intentarlo.');}}); }
exports.mesaEstado=callable(async req=>{
  authenticated(req); const mesaId=req.data?.mesaId; R.location(mesaId);
  return db.runTransaction(async tx=>({abierta:(await openOrders(tx,mesaId)).length>0}));
});
exports.crearPedido=callable(async req=>{
  const uid=authenticated(req),data=req.data||{},mesaId=data.mesaId;R.location(mesaId);
  const requestId=id(data.requestId);
  const orderId=createHash('sha256').update(`${uid}:${requestId}`).digest('hex');
  const orderRef=db.doc(`pedidos/${orderId}`), requestRef=db.doc(`solicitudes/${orderId}`),mesaRef=db.doc(`mesas/${mesaId}`),rateRef=db.doc(`limites/${uid}`);
  return db.runTransaction(async tx=>{
    const previous=await tx.get(requestRef); if(previous.exists) return {id:orderId,total:previous.data().total};
    await tx.get(mesaRef);
    const rate=await tx.get(rateRef); if(rate.exists&&Date.now()-rate.data().lastAt<3000) fail('Espera unos segundos antes de enviar otro pedido.','resource-exhausted');
    const catalog=await menu(tx), stocks=await tx.get(db.collection('stock'));
    const stock={};stocks.forEach(d=>stock[d.id]=d.data().disponible!==false);
    const followup=(await openOrders(tx,mesaId)).length>0;
    const quote=R.calculate(data.selection,catalog,stock,followup);
    if(data.expectedTotal!==undefined && data.expectedTotal!==quote.total) fail('La carta ha cambiado. Revisa el pedido antes de enviarlo.');
    const fecha=now(),order={schemaVersion:2,mesaId,mesa:R.location(mesaId).label,items:quote.items,total:quote.total,estado:'pendiente',fecha,entranteLista:false,comidaLista:false,bebidaLista:false,horaEntranteLista:null,horaComidaLista:null,horaBebidaLista:null,horaPagado:null,metodoPago:null,pedidoDeSeguimiento:followup,creadoPor:uid};
    tx.create(orderRef,order);tx.set(requestRef,{idPedido:orderId,total:quote.total,fecha});tx.set(rateRef,{lastAt:Date.now()});touchMesa(tx,mesaId);
    return {id:orderId,total:quote.total};
  });
});
exports.adminAccion=callable(async req=>{
  const uid=await administrator(req),data=req.data||{},action=data.action;
  if(action==='guardarCarta') {
    const products=R.validateCatalog(data.products);
    return db.runTransaction(async tx=>{const ref=db.doc('config/menu'),old=await tx.get(ref); const after={products,updatedAt:now()};tx.set(ref,after);audit(tx,uid,action,'config/menu',old.exists?old.data():null,after);return {ok:true};});
  }
  if(action==='stock') {
    const productId=id(data.productId);
    if(typeof data.disponible!=='boolean') fail('Disponibilidad inválida.','invalid-argument');
    return db.runTransaction(async tx=>{const catalog=await menu(tx);if(!catalog.some(p=>p.id===productId))fail('Producto desconocido.');const ref=db.doc(`stock/${productId}`),old=await tx.get(ref);const after={disponible:data.disponible};tx.set(ref,after);audit(tx,uid,action,ref.path,old.exists?old.data():null,after);return {ok:true};});
  }
  if(action==='cajaAbrir'||action==='cajaCerrar'||action==='cajaReabrir') {
    const date=R.day(),ref=db.doc(`caja/${date}`);
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref),before=snap.exists?snap.data():null;
      let after;
      if(action==='cajaReabrir') {const motive=reason(data.motivo);if(!before?.cerrado)fail('La caja no está cerrada.');after={...before,cerrado:false,fechaReapertura:now()};tx.set(ref,after);audit(tx,uid,action,ref.path,before,after,motive);return {ok:true};}
      if(!Number.isSafeInteger(data.amount)||data.amount<0||data.amount>100000000) fail('Introduce un importe entero válido.','invalid-argument');
      if(action==='cajaAbrir') {if(before?.cerrado)fail('Reabre la caja antes de modificarla.');after={...(before||{}),efectivoInicial:data.amount,fechaInicio:before?.fechaInicio||now(),cerrado:false};}
      else {if(!before||before.cerrado)fail('La caja no está abierta.');after={...before,efectivoFinal:data.amount,fechaCierre:now(),cerrado:true};}
      tx.set(ref,after);audit(tx,uid,action,ref.path,before,after);return {ok:true};
    });
  }
  if(action==='liberarMesa') {
    const mesaId=data.mesaId;R.location(mesaId);const motive=reason(data.motivo);
    return db.runTransaction(async tx=>{await tx.get(db.doc(`mesas/${mesaId}`));const open=await openOrders(tx,mesaId);if(open.length>150)fail('Hay demasiados pedidos: cancélalos individualmente.');
      open.forEach(doc=>{const before=doc.data(),after={...before,estado:'cancelado',motivoCancelacion:motive,fechaCancelacion:now()};tx.update(doc.ref,after);audit(tx,uid,action,doc.ref.path,before,after,motive);});touchMesa(tx,mesaId);return {ok:true};});
  }
  const orderId=id(data.id),ref=db.doc(`pedidos/${orderId}`);
  if(action==='restaurar') {
    const motive=reason(data.motivo);
    return db.runTransaction(async tx=>{const trashRef=db.doc(`papelera/${orderId}`),trash=await tx.get(trashRef),exists=await tx.get(ref);if(!trash.exists)fail('El pedido no está en la papelera.');if(exists.exists)fail('El pedido ya existe.');
      const stored=trash.data().pedido,mesaId=R.locationId(stored);if(mesaId)await tx.get(db.doc(`mesas/${mesaId}`));
      tx.set(ref,stored);tx.delete(trashRef);touchMesa(tx,mesaId);audit(tx,uid,action,ref.path,null,stored,motive);return {ok:true};});
  }
  return db.runTransaction(async tx=>{
    const doc=await tx.get(ref);if(!doc.exists)fail('El pedido ya no existe.','not-found');
    const before=doc.data(),mesaId=R.locationId(before);if(mesaId) await tx.get(db.doc(`mesas/${mesaId}`));
    if(action==='listo') {
      const field=data.field;if(!['entranteLista','comidaLista','bebidaLista'].includes(field)) fail('Sección no válida.','invalid-argument');
      if(before.estado!=='pendiente')fail('El pedido ya no está pendiente.');if(!R.requirements(before)[field])fail('El pedido no tiene productos de esa sección.');
      const timeField={entranteLista:'horaEntranteLista',comidaLista:'horaComidaLista',bebidaLista:'horaBebidaLista'}[field];
      const after={...before,[field]:true,[timeField]:before[timeField]||now()};if(R.ready(after))after.estado='realizado';
      tx.set(ref,after);audit(tx,uid,action,ref.path,before,after);return {ok:true};
    }
    if(action==='cobrar') {
      const paymentDate=new Date(),cashDay=R.day(paymentDate);
      const payRef=db.doc(`pagos/${orderId}`),existing=await tx.get(payRef),cash=await tx.get(db.doc(`caja/${cashDay}`));
      if(before.estado==='pagado') return {ok:true,alreadyPaid:true};
      if(before.estado!=='realizado'||!R.ready(before))fail('Termina todas las secciones antes de cobrar.');
      if(!cash.exists||cash.data().cerrado)fail('Abre la caja de hoy antes de cobrar.');
      if(existing.exists)fail('Existe un pago previo: revisa el registro en Datos.');
      if(!['efectivo','paypay'].includes(data.metodo))fail('Método de pago inválido.','invalid-argument');
      if(!Number.isSafeInteger(before.total)||before.total<=0)fail('El importe del pedido es inválido: corrígelo antes de cobrar.');
      const fecha=paymentDate.toISOString(),after={...before,estado:'pagado',metodoPago:data.metodo,horaPagado:fecha};
      tx.set(ref,after);tx.create(payRef,{idPedido:orderId,total:before.total,metodo:data.metodo,fecha,fechaDia:cashDay});touchMesa(tx,mesaId);audit(tx,uid,action,ref.path,before,after);return {ok:true};
    }
    if(action==='anularCobro') {
      const motive=reason(data.motivo),payments=await tx.get(db.collection('pagos').where('idPedido','==',orderId));
      if(before.estado!=='pagado'||!payments.size||payments.size>50)fail('El pedido no tiene un cobro que se pueda anular.');
      const dates=[...new Set(payments.docs.map(d=>d.data().fechaDia))];
      for(const date of dates) {if(!/^\d{4}-\d{2}-\d{2}$/.test(date))fail('Fecha de pago inválida.');const cash=await tx.get(db.doc(`caja/${date}`));if(cash.exists&&cash.data().cerrado)fail('No se pueden anular cobros de una caja cerrada.');}
      const after={...before,estado:R.ready(before)?'realizado':'pendiente',metodoPago:null,horaPagado:null};
      payments.forEach(p=>{tx.delete(p.ref);audit(tx,uid,action,p.ref.path,p.data(),null,motive);});tx.set(ref,after);touchMesa(tx,mesaId);audit(tx,uid,action,ref.path,before,after,motive);return {ok:true};
    }
    if(action==='borrar') {
      const motive=reason(data.motivo);
      tx.set(db.doc(`papelera/${orderId}`),{pedido:before,fechaBorrado:now(),borradoPor:uid,motivo:motive});tx.delete(ref);touchMesa(tx,mesaId);audit(tx,uid,action,ref.path,before,null,motive);return {ok:true};
    }
    if(action==='cancelar') {
      const motive=reason(data.motivo);if(before.estado==='pagado')fail('Anula el cobro antes de cancelar.');const after={...before,estado:'cancelado',fechaCancelacion:now(),motivoCancelacion:motive};tx.set(ref,after);touchMesa(tx,mesaId);audit(tx,uid,action,ref.path,before,after,motive);return {ok:true};
    }
    if(action==='corregir') {
      const motive=reason(data.motivo);if(before.estado==='pagado')fail('No se pueden modificar productos de un pedido cobrado. Anula su cobro primero.');
      const target=data.mesaId;R.location(target);if(target!==mesaId)await tx.get(db.doc(`mesas/${target}`));
      const catalog=await menu(tx),quote=R.calculate(data.selection,catalog,{},true);
      const after={...before,schemaVersion:2,mesaId:target,mesa:R.location(target).label,items:quote.items,total:quote.total,estado:'pendiente',entranteLista:false,comidaLista:false,bebidaLista:false,horaEntranteLista:null,horaComidaLista:null,horaBebidaLista:null,fechaCorreccion:now()};
      tx.set(ref,after);touchMesa(tx,mesaId);touchMesa(tx,target);audit(tx,uid,action,ref.path,before,after,motive);return {ok:true};
    }
    fail('Acción no permitida.','invalid-argument');
  });
});
