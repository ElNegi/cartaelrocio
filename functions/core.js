(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rocio = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const CATEGORIES = ['comida', 'entrante', 'extra', 'bebida'];
  const product = (id, category, price, es, en, ja, icon) => ({id, category, price, names:{es,en,ja}, icon, active:true});
  const CATALOG = [
    product('pollo','comida',400,'Pollo','Chicken','とり','🍗'),
    product('carnitas','comida',400,'Carnitas','Carnitas','ぶた','🐷'),
    product('rum','comida',400,'Rum','Rum','ひつじ','🐑'),
    product('alita','comida',400,'Alita','Wing','手羽元チキン','🪶'),
    product('pescado','comida',400,'Pescado','Fish','さかな','🐟'),
    product('fries','entrante',300,"Patatas Fritas","French Fries","フライドポテト",'🥔'),
    product('cheeseFries','entrante',300,"Patatas con Queso","Cheesy Fries","チーズフライドポテト",'🧀'),
    product('masa','extra',100,'Solo Masa','Just Tortilla','生地のみ','🌽'),
    product('jalapeno','extra',50,'Jalapeño Extra','Extra Jalapeño','ハラペーニョ追加','🌶️'),
    product('cola','bebida',200,'Coca-Cola','Coca-Cola','コカ・コーラ','🥤'),
    product('coffee','bebida',200,"Café Frío","Iced Coffee","アイスコーヒー",'☕'),
    product('orange','bebida',200,"Zumo de Naranja","Orange Juice","オレンジジュース",'🍊'),
    product('beer','bebida',600,"Cerveza","Beer","ビール",'🍺'),
    product('beerNA','bebida',600,"Cerveza Sin Alcohol","Non-Alcoholic Beer","ノンアルコールビール",'🍺'),
    product('carajillo','bebida',600,"Carajillo Frío","Iced Carajillo","アイス・カラヒージョ",'🥃'),
    product('sherry','bebida',600,"Sherry","Sherry","シェリー",'🍷'),
    product('tequila','bebida',600,"Tequila","Tequila Shot","テキーラshot",'🥃')
  ];
  const LOCATIONS = [ ...Array.from({length:2},(_,i)=>({id:`mesa-${i+1}`,label:`Mesa ${i+1}`})), ...Array.from({length:10},(_,i)=>({id:`silla-${i+1}`,label:`Silla ${i+1}`})) ];
  function location(id) { const found=LOCATIONS.find(x=>x.id===id); if(!found) throw new Error('Ubicación no válida.'); return found; }
  function aliases(id) { const l=location(id), n=id.split('-')[1]; return id.startsWith('mesa') ? [l.label,`Table ${n}`,`テーブル ${n}`] : [l.label,`Chair ${n}`,`カウンター席 ${n}`]; }
  function locationId(order) { return order.mesaId || LOCATIONS.find(l=>aliases(l.id).includes(order.mesa))?.id || null; }
  function validateCatalog(catalog) {
    if(!Array.isArray(catalog)||!catalog.length||catalog.length>80) throw new Error('La carta debe tener entre 1 y 80 productos.');
    const ids=new Set();
    return catalog.map(p=>{
      if(!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(p.id)||ids.has(p.id)) throw new Error('Identificador de producto inválido o duplicado.');
      ids.add(p.id);
      if(!CATEGORIES.includes(p.category)||!Number.isSafeInteger(p.price)||p.price<1||p.price>100000) throw new Error('Categoría o precio inválido.');
      if(p.category==='comida' && p.price!==400) throw new Error('Los tacos deben mantener el precio de ¥400 por unidad.');
      const names={}; for(const lang of ['es','en','ja']) { if(typeof p.names?.[lang]!=='string'||!p.names[lang].trim()||p.names[lang].length>90) throw new Error('Completa los nombres en los tres idiomas (máximo 90 caracteres).'); names[lang]=p.names[lang].trim(); }
      return {id:p.id,category:p.category,price:p.price,names,icon:typeof p.icon==='string'?p.icon.slice(0,12):'✦',active:p.active!==false};
    });
  }
  function calculate(selection,catalog=CATALOG,stock={},followup=false) {
    if(!selection || Array.isArray(selection)||typeof selection!=='object') throw new Error('Selección inválida.');
    let total=0,tacos=0,units=0; const items=[];
    for(const [id,quantity] of Object.entries(selection)) {
      if(!Number.isSafeInteger(quantity)||quantity<0||quantity>30) throw new Error('Cantidad inválida (máximo 30 por producto).');
      if(!quantity) continue;
      const p=catalog.find(x=>x.id===id&&x.active!==false);
      if(!p) throw new Error('Un producto ya no está en la carta.');
      if(stock[id]===false) throw new Error('Un producto seleccionado se ha agotado.');
      units+=quantity; total+=quantity*p.price;
      if(p.category==='comida') tacos+=quantity;
      items.push({id,category:p.category,quantity,unitPrice:p.price,names:{...p.names}});
    }
    if(!units) throw new Error('Añade al menos un producto.');
    if(units>100) throw new Error('El pedido supera las 100 unidades.');
    if(!followup && tacos<3) throw new Error('El primer pedido de la mesa requiere al menos 3 tacos.');
    return {total,tacos,items,units};
  }
  function sections(order,catalog=CATALOG) {
    const groups={entrante:[],comida:[],extra:[],bebida:[]};
    if(Array.isArray(order.items)) {
      for(const i of order.items) { if(groups[i.category] && Number.isSafeInteger(i.quantity)&&i.quantity>0) groups[i.category].push(i); }
      return groups;
    }
    const source=[...(order.tacos||[]).map(text=>({text,fallback:'comida'})),...(order.extras||[]).map(text=>({text,fallback:'extra'}))];
    const historical={fries:['Patatas Fritas','French Fries','フライドポテト'],cheeseFries:['Patatas con Queso','Cheesy Fries','チーズフライドポテト'],rum:['Rum'],masa:['Solo Masa']};
    for(const {text,fallback} of source) {
      const match=String(text).match(/^(\d+)\s*x\s*(.*)$/i), quantity=match?Number(match[1]):1, key=(match?match[2]:String(text)).trim();
      const p=[...CATALOG,...catalog].find(p=>p.id.toLowerCase()===key.toLowerCase()||Object.values(p.names).some(n=>n.toLowerCase()===key.toLowerCase())||(historical[p.id]||[]).some(n=>n.toLowerCase()===key.toLowerCase()));
      groups[p?.category||fallback].push({id:p?.id||key,category:p?.category||fallback,quantity,names:p?.names||{es:key,en:key,ja:key},unitPrice:p?.price||0});
    }
    return groups;
  }
  function requirements(order) { const g=sections(order); return {entranteLista:!!g.entrante.length,comidaLista:!!(g.comida.length+g.extra.length),bebidaLista:!!g.bebida.length}; }
  function ready(order) { return Object.entries(requirements(order)).every(([field,needed])=>!needed||order[field]===true); }
  function day(date=new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
  function escape(value) { return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  return {CATALOG,CATEGORIES,LOCATIONS,location,aliases,locationId,calculate,sections,requirements,ready,day,escape,validateCatalog};
});
