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
- **La subred de Docker no puede pisar la de la base.** Docker reparte
  `172.17.0.0/12` entre sus redes y la LAN de la compañía es `172.17.x.x`: la
  VM de Docker toma la IP de la base por local a `docker0` y no la rutea. El
  host llega y el contenedor no. Se arregla con `bip` +
  `default-address-pools` en `daemon.json`. Lo detecta el paso `[1b]` del
  deploy; el detalle está en `infraestructura/DEPLOYMENT.md`.
- **`prisma migrate dev` y `prisma migrate diff` son peligrosos contra la base
  de producción**: es compartida con otro sistema, y Prisma genera `DROP TABLE`
  para toda tabla que no esté en el schema. Ya propuso borrar `sysdiagrams`.
  Revisar el SQL generado antes de aplicarlo, siempre.
- **La base de producción está *baselineada*.** Como no estaba vacía, la
  migración inicial se aplicó con `db execute` + `migrate resolve --applied` en
  vez de `migrate deploy`. De ahí en adelante el flujo es el normal.
- **`docker compose up -d --build` no recrea el contenedor** si ya está
  corriendo: reconstruye la imagen y deja el contenedor viejo sirviendo el
  código anterior, con el despliegue en verde. Por eso `deploy.sh` y
  `deploy.ps1` usan `--force-recreate`.
- **Los `ALTER COLUMN` de SQL Server chocan con los índices y los `DEFAULT`**
  que cuelgan de la columna (error 5074). `prisma migrate diff` contempla los
  índices pero **no** los defaults: hay que agregar a mano el `DROP CONSTRAINT`
  y volver a crearlo. Ver
  `prisma/migrations/20260729103500_timestamps_con_offset`.
- **`getByText` y `getByRole(..., {name})` de Playwright hacen coincidencia
  parcial e insensible a mayúsculas.** Varias pruebas fallaron por eso; usar
  `exact: true` o los `data-testid` de las filas.
- **Un aviso que aparece dos veces rompe las pruebas por *strict mode*.** Las
  operaciones de fila muestran el resultado en el botón y en el panel de
  arriba a la vez. En las pruebas hay que apuntar a
  `getByTestId("alerta")`, que es el del panel.
- **El matcher del middleware deja fuera los archivos estáticos POR
  EXTENSIÓN.** Cuando sólo estaba listado `favicon.ico`, agregar
  `public/logo.png` y los iconos de `src/app` los dejó detrás del guard: sin
  sesión devolvían un 307 a `/login` y el navegador mostraba la imagen rota.

## Nómina y cuentas son dos cosas distintas

- `viandas_empleados` es la **nómina**: quien esté ahí aparece en el buscador
  de personal y se le puede pedir una vianda.
- `viandas_usuarios` es el **registro de cuenta**: contraseña y roles.

El alta de personal (`crearPersona`) crea **siempre las dos**, tenga rol o no.
El acceso lo decide `tieneAcceso()` = `activo && (esGl || esAdmin)`, así que
alguien sin rol queda en la nómina pero no inicia sesión; cuando más adelante
se lo marca GL, ya tiene con qué entrar.

Por eso la grilla de `/admin/usuarios` lista **empleados**, no usuarios, e
incluye a los dados de baja: si filtrara por activo, un empleado desactivado
desaparecería y no habría forma de reactivarlo.

"Crear cuentas faltantes" (antes "Sincronizar nómina") **no importa nada de
ninguna fuente externa**: le crea la cuenta a los empleados activos que no la
tengan. Con el alta creando siempre las dos, casi siempre va a dar cero.

## Operaciones destructivas: `PERMITIR_DESTRUCTIVO`

`db:import --truncate` y las pruebas e2e escriben y borran. Las dos exigen
`PERMITIR_DESTRUCTIVO=si` en el `.env` y abortan sin esa marca
(`src/lib/entorno.ts`). Es **fail-closed** a propósito: olvidarse de declararla
bloquea, nunca al revés. La marca va solo en desarrollo; en el servidor no
existe.

Si `npm run e2e` corta antes del primer test, es esto: el `.env` está apuntando
a la base de la compañía.

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

## Fechas: dos tipos de columna que no se mezclan

- **Los instantes** (`creado_at`, `cancelado_at`, `ultimo_login_at`,
  `password_actualizado_at`) son `DATETIMEOFFSET` y se guardan en UTC, con
  `+00:00` explícito. Se muestran con `formatearFechaHoraEnZona()`.
- **Las fechas sin hora** (`fecha_solicitud`) son `DATE` y se construyen
  **siempre** con `Date.UTC()`, porque `useUTC: true` en el adaptador las
  correría un día. Se muestran con `formatearFechaDdMmYyyy()`, que lee los
  componentes en UTC.

Usar el formateador equivocado no rompe nada visible hasta las 21:00 de
Argentina, cuando el UTC ya es el día siguiente y las fechas empiezan a
mostrarse corridas. Ya pasó en el detalle del historial.

Para leer un instante desde SSMS en hora local:

```sql
SELECT creado_at AT TIME ZONE 'Argentina Standard Time' FROM viandas_pedidos;
```

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
