const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../shared/core');
const context=vm.createContext({window:{},document:{getElementById:()=>null},Rocio:R});
vm.runInContext(fs.readFileSync(require.resolve('../public/translations.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require.resolve('../public/ui.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require.resolve('../public/customer-original.js'),'utf8').split("if(Service.demo)$('demo-banner')")[0],context);
test('los tres idiomas incluyen todos los textos originales y todos los productos',()=>{
  const translations=context.window.ORIGINAL_TRANSLATIONS;
  for(const lang of ['es','en','ja']){
    assert.deepEqual(Object.keys(translations[lang]).sort(),Object.keys(translations.es).sort());
    for(const value of Object.values(translations[lang]))assert.ok(typeof value==='string'&&value.trim());
    for(const product of R.CATALOG)assert.ok(product.names[lang]?.trim(),`${product.id}: ${lang}`);
  }
});
test('los errores de validación y conexión se presentan en el idioma elegido',()=>{
  const errors=['Añade al menos un producto.','El primer pedido debe incluir al menos 3 tacos.','Producto agotado.','La carta ha cambiado.','Cantidad no válida.','El producto ya no está en la carta.','Espera unos segundos.','Ubicación no válida.','El pedido admite hasta 20 productos distintos.','network request failed'];
  for(const lang of ['es','en','ja'])for(const message of errors){
    const result=vm.runInContext(`idiomaActual=${JSON.stringify(lang)}; errorMessage({message:${JSON.stringify(message)}})`,context);
    assert.ok(result.length);
    if(lang==='ja')assert.match(result,/[\u3040-\u30ff\u4e00-\u9fff]/);
    if(lang==='en')assert.doesNotMatch(result,/Añade|pedido|agotado|válida|Espera|conexión/);
  }
});
test('el precio visible de tacos y adicionales sigue los cambios de la carta',()=>{
  const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}},setAttribute(){}});return nodes.get(key);};
  node('card-masa').parentElement=node('extras');
  context.document={getElementById:node,querySelector:node,querySelectorAll:()=>[]};
  vm.runInContext("catalog=Rocio.CATALOG.map(p=>({...p,price:p.category==='comida'?450:p.price}));idiomaActual='en';renderProducts()",context);
  assert.equal(node('#tacos .price-tag-main').textContent,'¥1,350');
  assert.match(node('btn-extra-taco').textContent,/¥450/);
  vm.runInContext("catalog=catalog.map(p=>({...p,price:p.id==='pollo'?500:p.price}));renderProducts()",context);
  assert.equal(node('#tacos .price-tag-main').textContent,'');
  assert.match(node('.taco-builder-grid').innerHTML,/¥500/);
});
