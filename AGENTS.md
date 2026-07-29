<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# viandasWeb

Port web de la app de escritorio `C:\proyectosDev\viandas` (Python/Tkinter):
pedido de viandas para personal en overtime.

Next.js 16 + TypeScript + Tailwind 4 + Prisma 7 sobre SQL Server. Un solo
contenedor, puerto 3100. El correo se abre con `mailto:` en el cliente del GL;
no hay SMTP.

Ver `README.md` para la puesta en marcha y `infraestructura/DEPLOYMENT.md` para
el despliegue.

## Antes de tocar nada

- **Español** en código, comentarios, mensajes al usuario y commits.
- **Ninguna consulta a Prisma fuera de `src/server/`.** Es el equivalente de
  `src/repos/` de la app vieja.
- **Toda página bajo `(app)` lleva `export const dynamic = "force-dynamic"`.**
  Sin eso, `next build` intenta prerenderizar y falla porque no hay base.
- Los scripts que importan de `src/server/` necesitan
  `npx tsx --conditions=react-server`: `server-only` aborta fuera del bundler.
- Prisma 7: la URL de conexión ya no va en `schema.prisma` sino en
  `prisma.config.ts`, y el cliente usa `@prisma/adapter-mssql` configurado con
  variables sueltas (`DB_HOST`, `DB_PUERTO`, …), no con una cadena de conexión.

## Trampas que ya mordieron

- **El compose necesita `name: viandasweb`.** Sin eso Compose deriva el nombre
  de proyecto de la carpeta `infraestructura/`, que es el mismo que usa SGMIv2,
  y un `up` desde acá le recrea el contenedor `mssql` y le monta su volumen.
- **`DB_PASSWORD` no puede contener `#`.** `node --env-file` lo trata como
  comentario y trunca el valor sin avisar. Tampoco `; { } $ " '`.
- **El middleware no decide nada que dependa del estado del usuario.** Solo
  verifica la firma del JWT y rutea; el resto lo resuelve
  `src/lib/auth/guards.ts` contra la base. Si ambos deciden, en cuanto
  discrepan se produce un bucle infinito de redirecciones.
- **No se pueden mutar cookies desde un Server Component.** Por eso el guard
  redirige a `/login?motivo=…` y es el middleware el que borra la cookie.
- **Una server action que redirige a un destino que a su vez redirige** deja la
  URL del primer destino en la barra de direcciones. El login decide el destino
  final él mismo en vez de delegarlo.
- **La imagen de ejecución no lleva el CLI de Prisma.** Migra el servicio
  `migrator` del compose, que usa la etapa `builder`.
- **`getByText` y `getByRole(..., {name})` de Playwright hacen coincidencia
  parcial e insensible a mayúsculas.** Varias pruebas fallaron por eso; usar
  `exact: true` o los `data-testid` de las filas.

## Reglas de negocio heredadas que no se pueden "arreglar"

- Al escribir en el buscador de personal, **el filtro de sector se ignora** y
  se busca en toda la nómina. Es deliberado.
- **La selección sobrevive a los filtros**: por eso vive en un `Map` y no en el
  DOM. Permite armar pedidos con gente de varios sectores.
- **`Overtime` es el motivo por defecto** y se inyecta al principio del
  desplegable aunque no exista en la base; recién se persiste al usarlo.
- **`pedido_items` está desnormalizado a propósito** (guarda nombre, sector y
  cargo como texto): es un snapshot histórico y permite externos sin legajo.
  No agregarle una FK a `empleados`.
- **Dos de las tres ventanas de overtime cruzan la medianoche.** Cualquier
  cambio en la comparación de rangos debe seguir pasando
  `src/lib/overtime/overtime.test.ts`.

## Verificación

```bash
npm test        # unitarias: correo y overtime
npm run e2e     # navegador, con la app corriendo
npx tsc --noEmit
```

Las pruebas e2e trabajan contra la base real y esperan la nómina importada
(legajo 5169 administrador, 132 GL, 806 empleados). Restauran el estado que
tocan, pero si una queda a medias:

```bash
npx tsx --conditions=react-server --env-file=.env scripts/restablecer-usuarios-prueba.ts 5169 132
```
