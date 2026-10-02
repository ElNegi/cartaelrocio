const fs=require('fs'),path=require('path');
const n=20,slots=Array.from({length:n},(_,i)=>i);
const checks=slots.slice(0,7).map(i=>`(size <= ${i} || validItem(d.items[${i}], menu.productIndex[d.productIds[${i}]], ${i===0?"{'total':0,'units':0,'tacos':0}":`d.items[${i-1}].running`}))`).join('\n        && ');
const lineChecks=indices=>indices.map(i=>`(size <= ${i} || validItem(order.items[${i}], menu.productIndex[order.productIds[${i}]], order.items[${i-1}].running))`).join('\n        && ');
const remaining=lineChecks(slots.slice(7,14));
const seatChecks=lineChecks(slots.slice(14));
const rules=`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function admin() { return request.auth != null && exists(/databases/$(database)/documents/admins/$(request.auth.uid)); }
    function receiptId(id) { return id.matches('^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-4[a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$'); }
    function seatId(id) { return id in ['mesa-1','mesa-2','silla-1','silla-2','silla-3','silla-4','silla-5','silla-6','silla-7','silla-8','silla-9','silla-10']; }
    function seatLabel(id) { return id.matches('mesa-.*') ? 'Mesa ' + id.replace('mesa-', '') : 'Silla ' + id.replace('silla-', ''); }
    function countBefore(id) { return exists(/databases/$(database)/documents/mesas/$(id)) ? get(/databases/$(database)/documents/mesas/$(id)).data.openCount : 0; }
    function revBefore(id) { return exists(/databases/$(database)/documents/mesas/$(id)) ? get(/databases/$(database)/documents/mesas/$(id)).data.revision : 0; }
    function validItem(item, p, previous) {
      let q = item.quantity;
      let delta = p.increments[q];
      return q > 0 && p.active && p.available
        && item.diff(p.variants[q]).affectedKeys().hasOnly(['running'])
        && item.running == {'total':previous.total + delta.total,'units':previous.units + delta.units,'tacos':previous.tacos + delta.tacos};
    }
    function validOrder(d, id) {
      let size = d.items.size();
      let menu = get(/databases/$(database)/documents/config/menu).data;
      let last = d.items[size - 1].running;
      let seat = getAfter(/databases/$(database)/documents/mesas/$(d.mesaId)).data;
      let receipt = getAfter(/databases/$(database)/documents/solicitudes/$(id)).data;
      let count = countBefore(d.mesaId);
      return receiptId(id) && d.keys().hasAll(['schemaVersion','requestId','mesaId','mesa','items','productIds','total','estado','fecha','createdAt','entranteLista','comidaLista','bebidaLista','horaEntranteLista','horaComidaLista','horaBebidaLista','horaPagado','metodoPago','pedidoDeSeguimiento'])
        && d.keys().hasOnly(['schemaVersion','requestId','mesaId','mesa','items','productIds','total','estado','fecha','createdAt','entranteLista','comidaLista','bebidaLista','horaEntranteLista','horaComidaLista','horaBebidaLista','horaPagado','metodoPago','pedidoDeSeguimiento'])
        && d.schemaVersion == 3 && d.requestId == id && seatId(d.mesaId) && d.mesa == seatLabel(d.mesaId)
        && d.estado == 'pendiente' && d.createdAt == request.time && d.fecha is string && d.fecha.size() == 24
        && d.entranteLista == false && d.comidaLista == false && d.bebidaLista == false
        && d.horaEntranteLista == null && d.horaComidaLista == null && d.horaBebidaLista == null && d.horaPagado == null && d.metodoPago == null
        && d.items is list && d.items.size() > 0 && d.items.size() <= ${n}
        && d.productIds is list && d.productIds.size() == d.items.size() && d.productIds.toSet().size() == d.items.size()
        && ${checks}
        && last.units <= 100
        && d.total is int && d.total > 0 && d.total == last.total
        && d.pedidoDeSeguimiento == (count > 0)
        && (d.pedidoDeSeguimiento || last.tacos >= 3)
        && seat.requestId == id && seat.openCount == count + 1
        && receipt.idPedido == id && receipt.createdAt == request.time;
    }
    function validSeat(d, id) {
      let order = getAfter(/databases/$(database)/documents/pedidos/$(d.requestId)).data;
      let menu = get(/databases/$(database)/documents/config/menu).data;
      let size = order.items.size();
      return seatId(id) && receiptId(d.requestId) && d.keys().hasOnly(['openCount','abierta','revision','updatedAt','requestId'])
        && d.openCount == countBefore(id) + 1 && d.abierta == true && d.revision == revBefore(id) + 1 && d.updatedAt == request.time
        && order.mesaId == id && order.requestId == d.requestId && order.createdAt == request.time
        && getAfter(/databases/$(database)/documents/solicitudes/$(d.requestId)).data.idPedido == d.requestId
        && ${seatChecks};
    }
    function validReceipt(d, id) {
      let order = getAfter(/databases/$(database)/documents/pedidos/$(id)).data;
      let menu = get(/databases/$(database)/documents/config/menu).data;
      let size = order.items.size();
      return receiptId(id) && d.keys().hasOnly(['idPedido','total','createdAt']) && d.idPedido == id
        && d.createdAt == request.time && order.createdAt == request.time && d.total == order.total
        && ${remaining};
    }
    match /admins/{uid} { allow get: if request.auth != null && request.auth.uid == uid; allow list, write: if false; }
    match /config/menu { allow read: if true; allow write: if admin(); }
    match /stock/{id} { allow read: if true; allow write: if admin(); }
    match /mesas/{id} { allow get: if seatId(id); allow list: if admin(); allow create, update: if admin() || validSeat(request.resource.data,id); allow delete: if false; }
    match /solicitudes/{id} { allow get: if receiptId(id) || admin(); allow list: if admin(); allow create: if admin() || validReceipt(request.resource.data,id); allow update, delete: if false; }
    match /pedidos/{id} { allow read: if admin(); allow create: if admin() || validOrder(request.resource.data,id); allow update, delete: if admin(); }
    match /auditoria/{id} { allow read, create: if admin(); allow update, delete: if false; }
    match /{collection}/{id} { allow read, write: if admin() && collection in ['pagos','caja','papelera']; }
  }
}
`;
fs.writeFileSync(path.join(__dirname,'../firestore.rules'),rules);
