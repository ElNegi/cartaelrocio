(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core'));else root.RocioSpark=factory(root.Rocio);})(typeof globalThis!=='undefined'?globalThis:this,function(R){
  'use strict';
  const open=p=>p&&['pendiente','realizado'].includes(p.estado);
  const uuid=id=>{if(typeof id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))throw Error('Identificador inválido.');return id;};
  const reason=s=>{if(typeof s!=='string'||s.trim().length<3||s.length>500)throw Error('Indica el motivo (3–500 caracteres).');return s.trim();};
  const orderId=id=>{if(typeof id!=='string'||! /^[A-Za-z0-9_-]{1,160}$/.test(id))throw Error('Identificador inválido.');return id;};
  function menuData(products,unavailable={},updatedAt=new Date().toISOString()){
    const list=R.validateCatalog(products),productIndex={};
    list.forEach(p=>{const template={id:p.id,category:p.category,unitPrice:p.price,names:p.names};productIndex[p.id]={...p,available:unavailable[p.id]!==true,template,variants:Array.from({length:31},(_,quantity)=>({...template,quantity})),increments:Array.from({length:31},(_,q)=>({total:q*p.price,units:q,tacos:p.category==='comida'?q:0}))};});
    const menu={products:list,productIndex,updatedAt};
    if(new TextEncoder().encode(JSON.stringify(menu)).length>800000)throw Error('La carta es demasiado grande. Reduce el número de productos o la longitud de sus nombres.');
    return menu;
  }
  function orderItems(items){let total=0,units=0,tacos=0;return items.map(i=>{total+=i.quantity*i.unitPrice;units+=i.quantity;if(i.category==='comida')tacos+=i.quantity;return {...i,running:{total,units,tacos}};});}
  function create(db,auth,serverTimestamp){
    const stamp=()=>new Date().toISOString(),doc=path=>db.doc(path);
    async function staff(){const user=auth.currentUser;if(!user||user.isAnonymous||!(await doc('admins/'+user.uid).get()).exists)throw Error('No tienes permisos de administración.');return user.uid;}
    function audit(tx,uid,action,entity,before,after,motivo=null){tx.set(db.collection('auditoria').doc(),{uid,action,entity,before:before||null,after:after||null,motivo,fecha:stamp()});}
    function seatWrite(tx,id,snapshot,delta,requestId=null){if(!id)return;const before=snapshot?.exists?snapshot.data():{},count=Math.max(0,(before.openCount||0)+delta);tx.set(doc('mesas/'+id),{openCount:count,abierta:count>0,revision:(before.revision||0)+1,updatedAt:serverTimestamp(),requestId});}
    async function init(){
      await staff();const cfg=await doc('config/menu').get();
      if(cfg.exists&&cfg.data().sparkVersion===1)return;
      const [orders,stocks]=await Promise.all([db.collection('pedidos').get(),db.collection('stock').get()]);
      const unavailable={};stocks.docs.forEach(s=>unavailable[s.id]=s.data().disponible===false);
      const seats=await Promise.all(R.LOCATIONS.map(l=>doc('mesas/'+l.id).get()));
      const batch=db.batch(),counts={};orders.docs.forEach(o=>{if(open(o.data())){const id=R.locationId(o.data());if(id)counts[id]=(counts[id]||0)+1;}});
      batch.set(doc('config/menu'),{...menuData(cfg.exists?cfg.data().products:R.CATALOG,unavailable),sparkVersion:1});
      R.LOCATIONS.forEach((l,i)=>batch.set(doc('mesas/'+l.id),{openCount:counts[l.id]||0,abierta:!!counts[l.id],revision:(seats[i].data()?.revision||0)+1,updatedAt:serverTimestamp(),requestId:null}));
      await batch.commit();
    }
    async function customerOrder(data){
      const id=uuid(data.requestId),loc=R.location(data.mesaId),receipt=doc('solicitudes/'+id),order=doc('pedidos/'+id),seat=doc('mesas/'+loc.id);
      return db.runTransaction(async tx=>{
        const previous=await tx.get(receipt);if(previous.exists)return {id,total:previous.data().total};
        const [menuSnap,seatSnap]=await Promise.all([tx.get(doc('config/menu')),tx.get(seat)]);
        if(!menuSnap.exists||!menuSnap.data().productIndex)throw Error('La carta todavía no está preparada para recibir pedidos.');
        const cfg=menuSnap.data(),stock={};Object.entries(cfg.productIndex).forEach(([key,p])=>stock[key]=p.available!==false);
        const followup=!!(seatSnap.exists&&seatSnap.data().openCount>0),q=R.calculate(data.selection,R.validateCatalog(cfg.products),stock,followup);
        if(q.items.length>20)throw Error('El pedido admite hasta 20 productos distintos.');
        if(data.expectedTotal!==undefined&&data.expectedTotal!==q.total)throw Error('La carta ha cambiado. Revisa el pedido antes de enviarlo.');
        const fecha=stamp(),saved={schemaVersion:3,requestId:id,mesaId:loc.id,mesa:loc.label,items:orderItems(q.items),productIds:q.items.map(p=>p.id),total:q.total,estado:'pendiente',fecha,createdAt:serverTimestamp(),entranteLista:false,comidaLista:false,bebidaLista:false,horaEntranteLista:null,horaComidaLista:null,horaBebidaLista:null,horaPagado:null,metodoPago:null,pedidoDeSeguimiento:followup};
        tx.set(order,saved);tx.set(receipt,{idPedido:id,total:q.total,createdAt:serverTimestamp()});seatWrite(tx,loc.id,seatSnap,1,id);
        return {id,total:q.total};
      });
    }
    async function release(data,uid){
      const loc=R.location(data.mesaId),motivo=reason(data.motivo),seat=doc('mesas/'+loc.id);
      for(let attempt=0;attempt<5;attempt++){
        const base=await seat.get(),revision=base.exists?base.data().revision||0:0;
        const pages=await Promise.all([db.collection('pedidos').where('mesaId','==',loc.id).get(),db.collection('pedidos').where('mesa','in',R.aliases(loc.id)).get()]);
        const refs=[...new Map(pages.flatMap(page=>page.docs).filter(s=>open(s.data())).map(s=>[s.id,s.ref])).values()];
        if(refs.length>150)throw Error('Hay demasiados pedidos: cancélalos individualmente.');
        try{return await db.runTransaction(async tx=>{
          const current=await tx.get(seat);if((current.exists?current.data().revision||0:0)!==revision)throw Error('RETRY_SEAT');
          const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
          snapshots.filter(s=>s.exists&&open(s.data())&&R.locationId(s.data())===loc.id).forEach(s=>{const after={...s.data(),estado:'cancelado',fechaCancelacion:stamp(),motivoCancelacion:motivo};tx.set(s.ref,after);audit(tx,uid,'liberarMesa',s.ref.path,s.data(),after,motivo);});
          seatWrite(tx,loc.id,current,-(current.data()?.openCount||0));return {ok:true};
        });}catch(e){if(e.message!=='RETRY_SEAT')throw e;}
      }throw Error('La mesa está cambiando. Vuelve a intentarlo.');
    }
    async function admin(data){
      const uid=await staff(),action=data.action,date=R.day();
      if(action==='liberarMesa')return release(data,uid);
      if(['guardarCarta','stock'].includes(action))return db.runTransaction(async tx=>{
        const ref=doc('config/menu'),old=await tx.get(ref),before=old.exists?old.data():menuData(R.CATALOG),unavailable={};
        Object.entries(before.productIndex||{}).forEach(([id,p])=>unavailable[id]=p.available===false);
        let after;
        if(action==='stock'){
          if(typeof data.disponible!=='boolean'||!before.products.some(p=>p.id===data.productId))throw Error('Disponibilidad o producto inválido.');
          unavailable[data.productId]=!data.disponible;after={...menuData(before.products,unavailable),sparkVersion:1};
          tx.set(doc('stock/'+data.productId),{disponible:data.disponible});
        }else after={...menuData(data.products,unavailable),sparkVersion:1};
        tx.set(ref,after);audit(tx,uid,action,ref.path,before,after);return {ok:true};
      });
      if(['cajaAbrir','cajaCerrar','cajaReabrir'].includes(action))return db.runTransaction(async tx=>{
        const ref=doc('caja/'+date),snap=await tx.get(ref),before=snap.exists?snap.data():null;let after,motivo=null;
        if(action==='cajaReabrir'){motivo=reason(data.motivo);if(!before?.cerrado)throw Error('La caja no está cerrada.');after={...before,cerrado:false,fechaReapertura:stamp()};}
        else{
          if(!Number.isSafeInteger(data.amount)||data.amount<0||data.amount>100000000)throw Error('Introduce un importe entero válido.');
          if(action==='cajaAbrir'){if(before?.cerrado)throw Error('Reabre la caja antes de modificarla.');after={...(before||{}),efectivoInicial:data.amount,fechaInicio:before?.fechaInicio||stamp(),cerrado:false};}
          else{if(!before||before.cerrado)throw Error('La caja no está abierta.');after={...before,efectivoFinal:data.amount,fechaCierre:stamp(),cerrado:true};}
        }
        tx.set(ref,after);audit(tx,uid,action,ref.path,before,after,motivo);return {ok:true};
      });
      const id=orderId(data.id),ref=doc('pedidos/'+id);
      if(action==='restaurar')return db.runTransaction(async tx=>{
        const motivo=reason(data.motivo),trashRef=doc('papelera/'+id),[trash,existing]=await Promise.all([tx.get(trashRef),tx.get(ref)]);
        if(!trash.exists||existing.exists)throw Error('El pedido no está en la papelera o ya existe.');
        const stored=trash.data().pedido,mesaId=R.locationId(stored),seat=mesaId?await tx.get(doc('mesas/'+mesaId)):null;
        tx.set(ref,stored);tx.delete(trashRef);if(open(stored))seatWrite(tx,mesaId,seat,1);audit(tx,uid,action,ref.path,null,stored,motivo);return {ok:true};
      });
      const payments=action==='anularCobro'?(await db.collection('pagos').where('idPedido','==',id).get()).docs:[];
      return db.runTransaction(async tx=>{
        const snapshot=await tx.get(ref);if(!snapshot.exists)throw Error('El pedido ya no existe.');
        const before=snapshot.data(),mesaId=R.locationId(before),seat=mesaId?await tx.get(doc('mesas/'+mesaId)):null;let after,motivo=null,delta=0,target=null,targetSeat=null;
        if(action==='listo'){
          if(!['entranteLista','comidaLista','bebidaLista'].includes(data.field)||before.estado!=='pendiente'||!R.requirements(before)[data.field])throw Error('No se puede completar esta sección.');
          const field={entranteLista:'horaEntranteLista',comidaLista:'horaComidaLista',bebidaLista:'horaBebidaLista'}[data.field];after={...before,[data.field]:true,[field]:before[field]||stamp()};if(R.ready(after))after.estado='realizado';
        }else if(action==='cobrar'){
          if(before.estado==='pagado')return {ok:true,alreadyPaid:true};
          const payRef=doc('pagos/'+id),[existing,cash]=await Promise.all([tx.get(payRef),tx.get(doc('caja/'+date))]);
          if(before.estado!=='realizado'||!R.ready(before))throw Error('Termina todas las secciones antes de cobrar.');
          if(!cash.exists||cash.data().cerrado)throw Error('Abre la caja de hoy antes de cobrar.');
          if(existing.exists)throw Error('Existe un pago previo: revisa el registro en Datos.');
          if(!['efectivo','paypay'].includes(data.metodo)||!Number.isSafeInteger(before.total)||before.total<=0)throw Error('Método o importe de pago inválido.');
          const fecha=stamp();after={...before,estado:'pagado',metodoPago:data.metodo,horaPagado:fecha};tx.set(payRef,{idPedido:id,total:before.total,metodo:data.metodo,fecha,fechaDia:date});delta=-1;
        }else if(action==='anularCobro'){
          motivo=reason(data.motivo);if(before.estado!=='pagado'||!payments.length||payments.length>50)throw Error('No hay un cobro para anular.');
          const snaps=await Promise.all(payments.map(s=>tx.get(s.ref))),days=[...new Set(snaps.filter(s=>s.exists).map(s=>s.data().fechaDia))];
          if(!days.length)throw Error('No hay un cobro para anular.');
          if(days.some(day=>!/^\d{4}-\d{2}-\d{2}$/.test(day)))throw Error('Fecha de pago inválida.');
          const boxes=await Promise.all(days.map(day=>tx.get(doc('caja/'+day))));if(boxes.some(s=>s.exists&&s.data().cerrado))throw Error('No se pueden anular cobros de una caja cerrada.');
          snaps.filter(s=>s.exists).forEach(s=>{tx.delete(s.ref);audit(tx,uid,action,s.ref.path,s.data(),null,motivo);});after={...before,estado:R.ready(before)?'realizado':'pendiente',metodoPago:null,horaPagado:null};delta=1;
        }else if(action==='borrar'){
          motivo=reason(data.motivo);tx.set(doc('papelera/'+id),{pedido:before,fechaBorrado:stamp(),borradoPor:uid,motivo});tx.delete(ref);if(open(before))seatWrite(tx,mesaId,seat,-1);audit(tx,uid,action,ref.path,before,null,motivo);return {ok:true};
        }else if(action==='cancelar'){
          motivo=reason(data.motivo);if(before.estado==='pagado')throw Error('Anula el cobro antes de cancelar.');after={...before,estado:'cancelado',fechaCancelacion:stamp(),motivoCancelacion:motivo};delta=open(before)?-1:0;
        }else if(action==='corregir'){
          motivo=reason(data.motivo);if(before.estado==='pagado')throw Error('Anula el cobro antes de corregir.');target=R.location(data.mesaId).id;
          if(target!==mesaId)targetSeat=await tx.get(doc('mesas/'+target));
          const cfg=await tx.get(doc('config/menu')),q=R.calculate(data.selection,cfg.exists?cfg.data().products:R.CATALOG,{},true);
          after={...before,schemaVersion:3,mesaId:target,mesa:R.location(target).label,items:q.items,productIds:q.items.map(i=>i.id),total:q.total,estado:'pendiente',entranteLista:false,comidaLista:false,bebidaLista:false,horaEntranteLista:null,horaComidaLista:null,horaBebidaLista:null,fechaCorreccion:stamp()};
          if(target===mesaId)delta=open(before)?0:1;else{delta=open(before)?-1:0;}
        }else throw Error('Acción no permitida.');
        tx.set(ref,after);if(delta)seatWrite(tx,mesaId,seat,delta);if(target&&target!==mesaId)seatWrite(tx,target,targetSeat,1);audit(tx,uid,action,ref.path,before,after,motivo);return {ok:true};
      });
    }
    async function call(name,data){
      if(name==='mesaEstado'){R.location(data.mesaId);const s=await doc('mesas/'+data.mesaId).get();return {abierta:s.exists&&s.data().openCount>0};}
      if(name==='crearPedido')return customerOrder(data);
      if(name==='adminAccion')return admin(data);
      throw Error('Acción desconocida.');
    }
    return {call,init};
  }
  return {create,menuData,orderItems};
});
