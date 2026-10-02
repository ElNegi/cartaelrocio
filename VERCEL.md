# Publicación en Vercel

Sube esta carpeta completa al repositorio. En Vercel, importa el repositorio con la raíz en esta carpeta, sin seleccionar `public` como raíz del proyecto. El archivo `vercel.json` configura el comando `npm run sync` y la carpeta de salida `public`. Solo se sirven los archivos públicos de la carta y del panel.

## Firebase necesario

Vercel publica la web. Las funciones `mesaEstado`, `crearPedido` y `adminAccion` se ejecutan en Firebase, en la región configurada en `public/firebase-config.js`. Deben desplegarse junto con las reglas de Firestore según `LEEME.md`. No copies credenciales de administrador a la web ni a GitHub.

Comprueba en Firebase Authentication que el dominio final de Vercel está autorizado y que están activados el acceso anónimo para clientes y el acceso de administrador. El administrador necesita su documento `admins/UID`.

## Comprobación tras el despliegue

- Abrir `/` y `/admin.html` y comprobar que cargan scripts, estilos y logotipo.
- Recorrer español, inglés y japonés; comprobar navegación y mínimo de tres tacos en el primer pedido.
- Enviar un pedido identificado como prueba desde una ubicación libre. Comprobar que aparece una sola vez en el panel y separa entrantes, comidas con extras y bebidas.
- Comprobar el pedido adicional y el stock.
- Comprobar que una cuenta sin permisos no puede leer datos privados ni ejecutar acciones administrativas.
- Retirar el pedido de prueba con motivo y comprobar la recuperación desde la papelera.

El modo `?demo=1` solo se activa en localhost. En Vercel se utiliza Firebase real. La verificación local no confirma un despliegue en Vercel ni la configuración real de Firebase.

Referencia: https://vercel.com/docs/project-configuration/vercel-json
