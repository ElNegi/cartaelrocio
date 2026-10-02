# El Rocío: carta y administración

Web estática para Vercel o Firebase Hosting, conectada directamente a Firestore. Compatible con el plan Spark: no necesita Cloud Functions, Blaze ni facturación. Los clientes eligen ubicación y hacen pedidos sin iniciar sesión. Solo el personal usa correo y contraseña.

## Comportamiento

Se conserva el diseño y el texto originales en español, inglés y japonés, junto con la confirmación del pedido. El menú superior conduce a tacos, entrantes, extras, bebidas y alcohol. El control de tacos adicionales aparece junto a los tacos de Miguel; el primer pedido requiere tres tacos y las comandas adicionales de una ubicación abierta no tienen ese mínimo.

Las patatas se registran como entrantes. Tortilla y jalapeño son extras de comida. Cada pedido tiene sus áreas de preparación y queda listo para cobrar cuando se completan las necesarias. El catálogo y la disponibilidad admiten nuevos productos desde el panel.

Firestore valida cantidades, productos activos, disponibilidad, precios, nombres, total y el mínimo inicial. Pedido, recibo de reintento y ocupación se guardan juntos. Un pedido admite hasta 20 productos distintos y 100 unidades, con un máximo de 30 unidades por producto. Reintentar la misma solicitud no crea otra comanda, incluso después de retirar la original.

El panel permite corregir, cancelar, cobrar, anular un cobro, liberar una ubicación, borrar y restaurar pedidos. Borrar conserva una copia en la papelera y mantiene los pagos. Para retirar un ingreso incorrecto utiliza «Anular cobro», con motivo; una caja cerrada bloquea esa operación. Cobro e ingreso se registran juntos y no se duplican ante clics simultáneos. PayPay registra el método utilizado; la aplicación no procesa pagos.

«Datos y papelera» incluye búsqueda, consulta de registros, restauración, historial y copia JSON. No incluye borrado definitivo ni un importador que sobrescriba toda la base de datos.

## Activación gratuita en Firebase

1. Conserva el plan **Spark** de carta-el-rocio. No actives Functions, Blaze ni Identity Platform.
2. Activa **Authentication → Método de acceso → Correo electrónico/contraseña**. No es necesario habilitar usuarios anónimos.
3. En **Authentication → Usuarios** crea la cuenta del responsable. La contraseña la introduce y guarda el responsable; nunca va en GitHub ni en la carta.
4. Copia su UID. En Firestore crea **admins/UID**, con ese UID como identificador y un campo nombre. Solo la cuenta autorizada tendrá acceso al panel; el cliente no puede concederse permisos.
5. Añade el dominio final de Vercel a los dominios autorizados de Authentication. Añade localhost solo para probar el acceso real desde tu ordenador.
6. Guarda una copia de los datos existentes. Evita pedidos y cambios simultáneos durante la activación. Publica **firestore.rules** en la pestaña Reglas de Firestore. Alternativa con la CLI oficial: firebase deploy --project carta-el-rocio --only firestore.
7. Publica la web en Vercel. Entra primero en **/admin.html**: el primer acceso autorizado prepara catálogo y doce ubicaciones a partir de las comandas abiertas, sin modificar importes ni productos históricos. No borres manualmente config/menu o mesas mientras se aceptan pedidos.
8. Abre la caja y comprueba una comanda de prueba desde una ubicación libre. Retírala mediante la papelera con motivo.

Para autorizar otra cuenta de personal, crea su usuario y documento admins/UID. Eliminar ese documento revoca su acceso en las reglas. El panel no permite cambiar la lista de administradores.

El plan gratuito tiene cuotas; alcanzar los límites puede impedir nuevas operaciones. Esta configuración no activa cobros automáticos ni garantiza uso ilimitado. [Plan Spark y cuotas](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

La creación de pedidos exige validación; la lectura de comandas, caja, pagos, papelera y auditoría exige personal autorizado. El estado público de la ubicación solo indica si está abierta. Un identificador aleatorio de solicitud permite recuperar el resultado mínimo del reintento sin exponer su comanda. Las reglas no impiden enviar repetidamente pedidos válidos: el panel permite retirarlos de forma recuperable.

## Datos antiguos y mantenimiento

Se reconocen las etiquetas antiguas de ubicación en los tres idiomas. Los productos antiguos se clasifican por identificador o nombre conocido; las patatas aparecen como entrantes. Los nuevos pedidos tienen schemaVersion: 3. No se migran masivamente ni se recalculan importes históricos.

Los pedidos cobrados no permiten editar productos: anula el cobro, corrige, prepara y cobra de nuevo. Borrar una comanda cobrada conserva el ingreso. Cancelar o liberar conserva la comanda como cancelada. Restaurar recupera su estado y ocupación si seguía abierta.

El historial guarda usuario, acción, motivo y datos antes/después. La caja usa la fecha de Japón. La copia JSON lee todas las páginas de las colecciones del negocio; no es una instantánea transaccional. Descárgala sin operaciones simultáneas, preferiblemente después del cierre. No exporta usuarios de Authentication ni autorizaciones. La restauración del panel recupera pedidos de la papelera; conserva copias externas para otros problemas.

## Desarrollo y comprobación

Necesitas Node.js 22 o posterior. Ejecuta npm run preview y abre http://127.0.0.1:8765/index.html?demo=1 o admin.html?demo=1. La demostración solo funciona en localhost, usa datos ficticios del navegador y no toca Firebase.

npm test verifica cálculo, categorías, compatibilidad y los tres idiomas. npm run sync copia shared/core.js a public/core.js. Las reglas se generan con node scripts/spark-rules.cjs.

Para probar Firestore realmente, instala dependencias con npm install, utiliza Java 21 y ejecuta:

~~~sh
npx firebase emulators:exec --project demo-rocio-spark --only firestore "npm run test:firebase"
~~~

Las pruebas validan pedidos sin sesión, datos privados, reintentos, stock, futuros entrantes, ocupación, cobros simultáneos, caja cerrada, correcciones, papelera y restauración. También prueban 20 productos y 100 unidades, precios y totales falsos, pedidos vacíos, alteraciones en distintas posiciones y escrituras incompletas sin recibo o mesa. Se borran datos solo en el proyecto de emulador demo-rocio-spark.

La prueba local no sustituye la comprobación de producción. [Reglas y transacciones](https://firebase.google.com/docs/firestore/security/rules-conditions), [pruebas de reglas](https://firebase.google.com/docs/rules/unit-tests).
