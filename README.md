# Sistema de Viandas (web)

Los GLs y supervisores arman el pedido de viandas para el personal en overtime
y generan el correo. Es el reemplazo web de la app de escritorio en
`C:\proyectosDev\viandas` (Python/Tkinter), que se distribuía como un EXE por
PC y llevaba su propia base SQLite: no había datos compartidos ni forma simple
de actualizar.

- **Stack**: Next.js 16 (App Router) + TypeScript + Tailwind 4 + Prisma 7
- **Base**: SQL Server (dockerizado en desarrollo, de la compañía en producción)
- **Puerto**: 3100
- **Correo**: se abre en el cliente del GL vía `mailto:`; no hay envío por SMTP

> **Para desplegar en el servidor, ver [`SERVIDOR.md`](SERVIDOR.md).**

En producción la base **ya existe y es compartida** con otros sistemas: la
aplicación solo crea tablas, todas con el prefijo `viandas_`. Nunca intenta
crear la base.

## Puesta en marcha (desarrollo)

```bash
# 1. SQL Server en Docker
cd infraestructura
cp .env.example .env          # completar DB_PASSWORD y AUTH_SECRET
docker compose --profile container-db up -d

# 2. Base y datos
cd ..
npx prisma migrate deploy
cp /c/proyectosDev/viandas/viandas.db data/    # nómina de la app vieja
npm run db:import

# 3. Aplicación
npm run dev                   # http://localhost:3100
```

El `.env` de la raíz es para trabajar desde el host (Prisma CLI, scripts y
`npm run dev`); el de `infraestructura/` es el que consume Docker.

La contraseña inicial de cada persona es su número de legajo, y el sistema
obliga a cambiarla en el primer ingreso. Solo entran quienes tienen `es_gl` o
`es_admin`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el 3100 |
| `npm run build` | Compilación de producción (salida standalone) |
| `npm test` | Pruebas unitarias (Vitest): correo y ventanas de overtime |
| `npm run e2e` | Pruebas de navegador (Playwright). Requiere la app corriendo |
| `npm run db:import` | Importa `data/viandas.db` a SQL Server (`-- --truncate` para rehacer) |
| `npm run db:studio` | Explorador de la base |
| `./deploy.sh` | Despliegue completo (ver `infraestructura/DEPLOYMENT.md`) |

Scripts de verificación puntual:

```bash
npx tsx --conditions=react-server --env-file=.env scripts/verificar-fase1.ts
npx tsx --conditions=react-server --env-file=.env scripts/verificar-fase2.ts
npx tsx --conditions=react-server --env-file=.env scripts/restablecer-usuarios-prueba.ts 5169
```

> El `--conditions=react-server` no es opcional: `server-only` aborta si se lo
> carga fuera del bundler.

## Estructura

```
src/
  app/
    (auth)/      login y cambio de contraseña (sin navegación)
    (app)/       aplicación: pedido, historial, config, admin
    api/         health y descarga del borrador .eml
  components/    ui/ · pedido/ · historial/ · admin/
  lib/
    auth/        sesión (JWT), contraseñas, guards, límite de intentos
    mail/        plantillas, armado, mailto y .eml
    overtime/    parseo y validación de las ventanas
    prefs/       registro de preferencias y quién puede editarlas
  server/        capa de datos: toda consulta a Prisma vive acá
prisma/          schema y migraciones
scripts/         importación y verificaciones
e2e/             pruebas de navegador
infraestructura/ compose, .env y documentación de despliegue
```

## Decisiones que conviene conocer antes de tocar el código

**El middleware no decide nada que dependa del estado del usuario.** Solo
verifica la firma del JWT y rutea. Si debe cambiar la contraseña, si es
administrador o si sigue activo lo resuelve `src/lib/auth/guards.ts`, que lee
la base. El motivo es concreto: el token dura 8 horas y envejece; si el
middleware decidiera con la cookie y el guard con la base, en cuanto discrepan
—por ejemplo cuando un administrador restablece una contraseña— se produce un
bucle infinito de redirecciones.

**La selección de personal vive en un `Map`, nunca en el DOM.** Por eso
sobrevive a cambiar de sector y a buscar, que es lo que permite armar un pedido
con gente de varios sectores. Y cuando hay texto en el buscador, el filtro de
sector se ignora a propósito: es la regla de la app original y sirve para
encontrar a alguien de otro sector sin perder lo ya marcado.

**El `mailto:` tiene un techo de ~2.000 caracteres.** Windows y Outlook lo
cortan sin avisar, y con 12 personas ya se pasa. Por eso el largo se mide
*antes* de intentar abrirlo y, si no entra, se ofrece descargar un `.eml`
(que Outlook abre como borrador editable gracias a la cabecera `X-Unsent`).

**Las preferencias se filtran por rol en el servidor.** `src/lib/prefs/registro.ts`
es la autoridad: los campos deshabilitados en la interfaz son solo comodidad
visual, quitarles el `disabled` desde el navegador no cambia nada.

**Dos de las tres ventanas de overtime cruzan la medianoche.** La comparación
de rangos lo contempla; cualquier cambio ahí debe seguir pasando
`src/lib/overtime/overtime.test.ts`.

**La imagen de ejecución no lleva el CLI de Prisma.** Las migraciones las
aplica el servicio `migrator` del compose, que reutiliza la etapa de
compilación. Copiar el CLI a la imagen liviana deja afuera dependencias
transitivas y termina en `Cannot find module 'effect'`.

## Convenciones

- Código, comentarios y mensajes de commit en español.
- Ninguna consulta a Prisma fuera de `src/server/`.
- Toda página bajo `(app)` lleva `export const dynamic = "force-dynamic"`:
  sin eso, la compilación intenta prerenderizar y falla porque no hay base.
- Los `.sh` van con fin de línea LF y los `.ps1` con CRLF y BOM
  (ver `.gitattributes`).
