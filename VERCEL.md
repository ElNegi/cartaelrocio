# Publicación en Vercel

Sube el proyecto completo al repositorio. En Vercel utiliza la raíz del repositorio: vercel.json ejecuta npm run sync y publica public/. Pedidos y panel acceden directamente a Firestore. No hay Cloud Functions ni servidor de pago.

Antes de aceptar pedidos completa la configuración gratuita de LEEME.md: reglas, cuenta del responsable, autorización admins/UID y primer acceso del administrador. Añade cartaelrocio.vercel.app a los dominios autorizados de Authentication. Los clientes no necesitan cuenta, acceso anónimo ni iniciar sesión.

Comprueba el despliegue de producción después de actualizar la rama conectada a Vercel:

- Abre / y /admin.html y comprueba scripts, estilos y logotipo.
- Recorre los tres idiomas, la selección de ubicación, el menú superior y los tres tacos obligatorios del primer pedido.
- Envía una comanda de prueba desde una ubicación libre. Comprueba que aparece una sola vez y separa entrantes, comida con extras y bebidas.
- Comprueba el pedido adicional, disponibilidad y acceso del personal.
- Retira la prueba con motivo mediante la papelera recuperable.

?demo=1 solo funciona en localhost. Las pruebas locales no certifican cuentas, reglas ni despliegue de producción. No publiques contraseñas, claves privadas o cuentas de servicio.

[Configuración de Vercel](https://vercel.com/docs/project-configuration/vercel-json).
