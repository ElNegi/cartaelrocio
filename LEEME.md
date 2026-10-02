# El Rocío · Carta y administración, versión 2

Esta carpeta contiene el proyecto completo actualizado. La carta y el panel están en `public/`. No se ha desplegado en el proyecto de Firebase ni se han modificado sus datos reales.

## Qué cambia

- Se conserva la carta original, sus textos, colores, tipografías y estructura en español, inglés y japonés. Se mantiene la confirmación antes de enviar y se añade un menú superior que permanece visible con accesos a Tacos, Entrantes, Extras, Bebidas y Alcohol.
- Registro de **entrantes** separado: las patatas se preparan aquí, nunca como bebidas.
- Registro de **comida**, con **extras de comida** dentro: tortilla y jalapeño pertenecen a cocina.
- Registro de **bebidas** separado. Cada área tiene su indicador, hora de preparación y botón de completado. El pedido pasa a cobro cuando todas sus áreas necesarias están listas.
- Precio calculado con las cantidades elegidas. Primer pedido: al menos 3 tacos; pedidos adicionales de la ubicación: sin mínimo. Tacos a ¥400 por unidad.
- El servidor valida catálogo, cantidades, disponibilidad y total. No se pueden enviar pedidos vacíos. Los reintentos de una misma solicitud no crean otra comanda.
- El cobro y el ingreso se guardan en una transacción. El registro de pago usa el identificador del pedido para impedir cobros duplicados. PayPay sigue siendo un registro del método utilizado, no una pasarela de pago.
- Administración con correo y contraseña de Firebase Authentication. Los datos de pedidos, caja y pagos son privados. Las escrituras directas desde el navegador están bloqueadas.
- Borrar mueve un pedido a una papelera recuperable. Sus cobros se conservan. Para quitar un ingreso erróneo, primero usa **Anular cobro**, con motivo. No se permite anular cobros de cajas cerradas.
- Corrección de productos, cantidades y ubicación, con recálculo y reinicio de preparación. Cancelación de comandas y liberación de mesas sin falsear ingresos.
- Carta y stock editables desde administración: nombres en tres idiomas, precios, categorías, iconos, ocultación de productos y disponibilidad. Se pueden añadir futuros entrantes, extras y bebidas.
- Panel de datos con buscador, inspección de registros, papelera, restauración, historial de cambios y exportación de una copia JSON.
- Caja con fecha fija de Japón, cierre, diferencia entre efectivo esperado y contado, y reapertura con motivo.

## Probar sin tocar Firebase

Necesitas Node.js 22 o posterior. Desde esta carpeta:

```powershell
node scripts/preview.cjs
```

Abre:

- Carta: <http://127.0.0.1:8765/index.html?demo=1>
- Panel: <http://127.0.0.1:8765/admin.html?demo=1>

El modo de prueba solo funciona en localhost y guarda datos ficticios en este navegador. Carta y panel comparten esos datos entre pestañas. Desde «Datos y papelera» puedes reiniciar la prueba. No introduzcas datos reales en la demostración.

Sin `?demo=1`, la aplicación utiliza Firebase y requiere la configuración del siguiente apartado. Abrir el HTML haciendo doble clic no es el método de prueba: utiliza el servidor local.

## Activar en Firebase

El proyecto original apunta a **carta-el-rocio**. Se conservó su configuración pública de conexión. No existe ninguna contraseña de administrador en el código.

1. En la consola de Firebase de ese proyecto, activa **Authentication → Sign-in method → Anonymous** para los clientes y **Email/Password** para el personal.
2. Crea la cuenta del responsable en **Authentication → Users** con su propio correo y contraseña. Copia su UID.
3. En Firestore crea el documento **`admins/UID_DEL_RESPONSABLE`**, usando ese UID como identificador, y añade un campo `nombre` con el nombre del responsable. La existencia de este documento autoriza a la cuenta. Añade otros UID igual cuando quieras dar acceso a personal. El panel no permite autoasignarse permisos.
4. Confirma en Authentication que el dominio de Hosting está autorizado. Para usar autenticación real desde localhost, añade localhost a los dominios autorizados si no aparece.
5. Cloud Functions necesita que el proyecto admita su despliegue y facturación (plan Blaze). Las llamadas usan la región `asia-northeast1`.
6. Haz una copia de la base de datos existente antes del cambio. Durante el despliegue y la comprobación final, detén los pedidos de clientes para que no se mezcle la versión anterior con las reglas nuevas.
7. Instala las dependencias del servidor y despliega **funciones, reglas y Hosting juntos**:

```powershell
npm install --prefix functions
node scripts/sync-core.cjs
firebase login
firebase deploy --project carta-el-rocio --only functions,firestore,hosting
```

Necesitas la CLI oficial de Firebase instalada y una cuenta autorizada para ese proyecto. No publiques solo `public/`: las llamadas al servidor y las reglas también son parte necesaria de esta actualización. `firebase.json` publica exclusivamente `public/`; ni el servidor ni las pruebas ni este documento se sirven como página web.

8. Entra en `/admin.html`, abre la caja y haz una prueba controlada de pedido, tres secciones listas y cobro. Comprueba que existe un único documento de pago y que caja refleja el importe correcto. Cancela o anula el cobro de la prueba y borra la comanda con motivo.
9. Comprueba que, sin una cuenta autorizada, los datos privados y las escrituras directas a Firestore se rechazan. El HTML del panel puede descargarse públicamente; los datos y las acciones son los elementos protegidos.
10. Si clientes tenían la carta antigua abierta, pídeles recargar: sus escrituras directas dejarán de funcionar con las reglas nuevas.

Documentación oficial: [funciones invocables](https://firebase.google.com/docs/functions/callable), [condiciones de reglas de Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions), [despliegue de funciones](https://firebase.google.com/docs/functions/get-started).

## Datos existentes y mantenimiento

Las comandas anteriores se reconocen por `mesaId` o por sus etiquetas antiguas de mesa/asiento en español, inglés y japonés. Los productos antiguos se clasifican por sus identificadores o nombres conocidos. Los pedidos nuevos tienen `schemaVersion: 2` y una lista `items` con identificador, categoría, cantidad, nombre en cada idioma y precio de ese momento.

Las patatas antiguas se muestran como entrantes. Si una comanda antigua figura «realizada» pero sus secciones no cumplen las reglas nuevas, usa **Corregir** para revisarla y volver a completar sus secciones. No se ejecuta ninguna migración masiva de pedidos ni se alteran importes históricos automáticamente.

Los pedidos cobrados no permiten editar productos. Para corregir un cobro equivocado: **Anular cobro → Corregir → completar secciones → Cobrar**. Si su caja está cerrada, el panel bloquea la anulación. La reapertura incluida opera sobre la caja de hoy; para una corrección contable de días anteriores revisa el caso y su respaldo antes de intervenir en la consola de Firebase.

Borrar una comanda cobrada NO quita dinero de caja. Borrar un pedido sin cobrar libera su ocupación de mesa. Restaurarlo recupera el estado original. Cancelar o liberar conserva la comanda bajo «Cancelados».

La exportación JSON contiene todas las páginas de las colecciones de negocio y el historial de cambios. Las colecciones se leen una a una: si hay operaciones durante la descarga, no es una instantánea transaccional. Para un respaldo consistente, descarga después del cierre, sin operaciones simultáneas. Las cuentas de Authentication y la lista de administradores se gestionan en Firebase y no se exportan desde este panel.

La restauración del panel recupera comandas de la papelera. No hay un importador general que sobrescriba toda la base de datos desde un archivo JSON. Para una recuperación total conserva además una exportación gestionada de Firestore con los procedimientos de tu proyecto.

El historial `auditoria` guarda usuario, hora, motivo y datos antes/después de cada acción administrativa. Los clientes no pueden leerlo ni modificarlo. Por claridad contable, nunca se vacía la papelera desde la interfaz.

## Verificación y desarrollo

```powershell
node --test --test-isolation=none tests/core.test.cjs tests/backend.test.cjs
```

Las pruebas verifican cálculo, stock, cantidades inválidas, entradas antiguas, categorías extensibles, acceso denegado, idempotencia, cobro atómico ante fallo, caja cerrada, papelera/restauración, correcciones, liberación y auditoría. Las pruebas del servidor ejecutan las funciones reales con un almacén simulado que exige lecturas antes de escrituras y commits completos; no sustituyen una validación de las reglas y permisos en Firebase.

También se ha recorrido en navegador local el envío, las tres áreas de preparación, el cobro, la actualización de caja y el borrado/restauración. Las reglas, Authentication y el despliegue real necesitan verificarse en el proyecto al activarlo.

Revisión de idiomas: español, inglés y japonés comprobados en navegador con selección de asiento, cantidades, confirmación y envío. Se conservan los textos originales; los mensajes nuevos, errores y controles se traducen. El primer pedido exige tres tacos; el pedido adicional permite solo bebida. La navegación fija llega a cada sección. Los pedidos ficticios de esta comprobación se movieron a la papelera y el ingreso ficticio se anuló. No se ha accedido a los pedidos reales ni se ha borrado ninguno: la consola Firebase solicita iniciar sesión.

Para probar con emuladores de Firebase, instala las dependencias y arranca `firebase emulators:start`. Usa `?emulator=1` en las páginas servidas por el emulador de Hosting. Crea el usuario de prueba y su documento `admins/UID` en los emuladores. No mezcles `emulator=1` con `demo=1`.

`functions/core.js` es la fuente de cálculo y clasificación compartida. Ejecuta `node scripts/sync-core.cjs` al modificarla para actualizar `public/core.js`.

## Rectificación de alcance

Se ha recuperado el diseño y los textos originales de la carta. El panel conserva el tema oscuro y las tipografías originales. Las funciones de revisión previa del pedido, edición de catálogo, anulación de cobros y reapertura de caja se habían añadido sin consulta específica. El usuario ha confirmado que la pantalla de revisión y las funciones adicionales se conservan; el diseño original se mantiene. No se ha publicado nada ni alterado datos reales.
