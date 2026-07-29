# Despliegue

## Topologías

| Dónde | `DB_MODE` | Base de datos | Puerto de SQL Server en el host |
|---|---|---|---|
| Equipo de desarrollo | `container` | SQL Server 2022 en Docker | 14330 |
| Servidor de producción | `external` | SQL Server de la compañía en la red | — |

El `14330` no es capricho: SGMIv2 ya publica su SQL Server en el 1433 de la
máquina de desarrollo.

## Servicios

| Servicio | Perfil | Rol |
|---|---|---|
| `mssql` | `container-db` | SQL Server 2022. Solo con `DB_MODE=container` |
| `migrator` | `app` | Aplica las migraciones y termina. La app espera a que salga bien |
| `app` | `app` | Next.js, publicado en `APP_PUERTO` (3100) |

El `migrator` usa la etapa `builder` de la imagen porque ahí el CLI de Prisma
está completo. La imagen de ejecución es deliberadamente mínima y no lo lleva.

## La subred de Docker no puede pisar la de la base

**Verificar esto antes de nada en cualquier máquina nueva.** Docker usa
`172.17.0.0/16` para `docker0` y reparte `172.17.0.0/12` (o sea `172.17` a
`172.31`) entre las redes de los proyectos. Si el SQL Server de la compañía
vive en ese rango —y `172.17.x.x` es un rango de LAN corporativa muy común—,
la VM de Docker considera que esa IP es **local a su propio bridge** y jamás la
rutea a la red.

El síntoma es desconcertante: desde el host la base se alcanza sin problema,
pero el `migrator` muere con `P1001: Can't reach database server`.

```bash
docker run --rm --network host busybox ip route
```

Si alguna ruta contiene la IP de la base (por ejemplo `172.17.0.0/16 dev
docker0` con la base en `172.17.132.153`), hay colisión. Se corrige moviendo
Docker fuera de ese rango, en `daemon.json` —en Windows,
`%USERPROFILE%\.docker\daemon.json`; en Linux, `/etc/docker/daemon.json`:

```json
{
  "bip": "10.99.0.1/24",
  "default-address-pools": [
    { "base": "10.100.0.0/16", "size": 24 }
  ]
}
```

Y **reiniciar Docker de verdad**: en Docker Desktop no alcanza con cerrar la
ventana, porque `com.docker.backend` sigue vivo y el daemon no relee el
archivo. Hay que usar *Settings → Docker Engine → Apply & restart*, o el menú
de la ballena → *Restart*. Se confirma con:

```bash
docker info --format "{{json .DefaultAddressPools}}"   # no debe ser null
```

Al reiniciar, las redes de los demás proyectos se recrean con IPs nuevas. Los
volúmenes no se tocan.

El paso `[1b]` de `deploy.sh` / `deploy.ps1` comprueba esto solo: prueba el
puerto desde el host **y** desde un contenedor, y si el primero llega y el
segundo no, aborta explicando el problema.

## Primer despliegue en el servidor Windows

Antes de empezar, **confirmar con el DBA** que el SQL Server de la compañía:

1. Acepta **autenticación SQL** (modo mixto). Desde un contenedor Linux no hay
   forma de usar autenticación integrada de Windows: si el servidor solo
   admite eso, este despliegue no es posible sin replantear la arquitectura.
2. Tiene **TCP/IP habilitado** en SQL Server Configuration Manager.
3. Tiene el puerto abierto en el firewall.
4. Provee un login con permisos `db_owner` sobre la base de destino.

Después:

```bat
git clone <repositorio> C:\viandasWeb
cd C:\viandasWeb
deploy.bat
```

El asistente pregunta el modo (`external`), los datos de conexión, el puerto y
la rama, y genera `infraestructura\.env`. A partir de ahí, cada actualización
es simplemente `deploy.bat`.

> El asistente **escribe el `.env` entero**. Si en cambio se edita a mano,
> reemplazar los valores existentes en vez de agregar líneas al final: con
> claves duplicadas gana la última y el resultado es dificilísimo de leer. En
> particular `DB_HOST=mssql` es el valor del modo `container`; con `external`
> tiene que ser la IP o el nombre del servidor, o el `migrator` va a resolver
> el nombre de red del contenedor de desarrollo y el despliegue va a **dar todo
> verde apuntando a la base equivocada**.

### Base compartida con otros sistemas

Si las tablas `viandas_*` conviven con las de otro sistema en la misma base, el
primer `prisma migrate deploy` **falla** con `P3005: The database schema is not
empty`. Es una protección de Prisma: no encuentra `_prisma_migrations` y ve la
base con tablas, así que se niega a tocarla.

Se resuelve una sola vez, desde una máquina con el código y acceso a la base:

```bash
npx prisma db execute --file prisma/migrations/<la-inicial>/migration.sql
npx prisma migrate resolve --applied <la-inicial>
npx prisma migrate status     # "Database schema is up to date!"
```

A partir de ahí `migrate deploy` funciona normalmente y el `migrator` del
compose no vuelve a quejarse.

> **Nunca correr `prisma migrate dev` ni aplicar a ciegas la salida de `prisma
> migrate diff` contra una base compartida.** Prisma solo conoce el schema de
> este proyecto: toda tabla ajena le parece sobrante y genera `DROP TABLE` para
> ella. En esta base propuso borrar `sysdiagrams`. Revisar el SQL generado
> línea por línea antes de aplicarlo.

Abrir el puerto 3100 en el firewall de Windows Server para que la LAN llegue:

```powershell
New-NetFirewallRule -DisplayName "viandasWeb 3100" -Direction Inbound `
  -Protocol TCP -LocalPort 3100 -Action Allow
```

## Carga inicial de la nómina

La base arranca vacía: las migraciones crean las tablas pero no los datos. La
nómina se importa una sola vez desde la SQLite de la app vieja.

```bash
# En una máquina con el código y acceso a la base de destino
cp /ruta/a/viandas.db data/
npm run db:import
```

Los 806 empleados quedan con contraseña igual a su legajo y cambio obligatorio
en el primer ingreso. Los roles (`es_admin`, `es_gl`) se importan tal como
estaban en la SQLite. Si ningún administrador quedara marcado, se promueve a
alguien a mano:

```sql
UPDATE viandas_usuarios SET es_admin = 1 WHERE legajo = <legajo>;
```

**Se importa una sola vez, no en cada despliegue.** Si el servidor apunta a una
base que ya tiene la nómina, saltear este paso: el script aborta solo al
detectar datos, pero no hay motivo para correrlo.

De ahí en adelante el personal se administra desde la aplicación, en
**Admin → Usuarios**: alta de personas nuevas, corrección de nombre, sector,
cargo y turno, y baja cuando alguien deja la planta. El importador no se vuelve
a usar.

### Operaciones que borran datos

`--truncate` vacía las once tablas y reinicia los IDENTITY: se lleva puesta la
nómina, las cuentas y todo el historial de pedidos. Igual que las pruebas e2e,
exige `PERMITIR_DESTRUCTIVO=si` en el `.env` y aborta sin esa marca, además de
pedir que se tipee el nombre de la base.

**Esa marca no va en el servidor.** Es lo único que separa a la base de
producción de un borrado accidental.

## Checklist del servidor

Con la base de la compañía **ya migrada y con la nómina cargada** (hecho desde
el equipo de desarrollo el 29/07/2026), el servidor no necesita ninguna tarea
de base de datos. Queda:

1. **Comprobar la subred de Docker.** Es lo único que puede obligar a
   reconfigurar la máquina.

   ```bash
   docker run --rm --network host busybox ip route
   ```

   Si alguna ruta contiene la IP del SQL Server, aplicar el `daemon.json` de la
   sección de arriba y reiniciar Docker. Si no, seguir de largo.

2. **Clonar y configurar.**

   ```bat
   git clone <repositorio> C:\viandasWeb
   cd C:\viandasWeb
   deploy.bat
   ```

   El asistente arranca solo la primera vez (no existe `infraestructura\.env`).
   Responder `external` y los datos de la base. `DB_PUERTO` es **1433**, no
   14330: ese es el del contenedor de desarrollo.

3. **Desplegar.** El mismo `deploy.bat` sigue de largo y levanta todo. El paso
   `[1b]` valida el acceso a la base desde el host y desde un contenedor antes
   de construir nada; el `[4]` va a informar *"Sin migraciones pendientes"*,
   que es lo correcto: la base ya está al día.

4. **Abrir el puerto** 3100 en el firewall (comando más abajo).

5. **Entrar** desde otra máquina de la LAN y verificar el login.

**No correr `npm run db:import` en el servidor**: la nómina ya está. Y no hace
falta baseline: ya se hizo sobre esa misma base.

## Actualizaciones

```bash
./deploy.sh          # Linux o Git Bash
deploy.bat           # Windows Server
```

Pasos que ejecuta: sanea el `.env`, `git pull`, construye, levanta, espera a
que los contenedores estén sanos, verifica las migraciones, prueba
`/api/health` y limpia imágenes huérfanas.

Aborta si hay cambios locales sin confirmar, para no desplegar algo que no
está en el repositorio.

## Diagnóstico

`GET /api/health` devuelve el estado de la app y de la base, más el valor de
`COOKIE_SECURE` y la zona horaria. Es el primer lugar donde mirar.

| Síntoma | Causa habitual |
|---|---|
| El login vuelve a la pantalla de login sin error | `COOKIE_SECURE=true` sirviendo por HTTP. El navegador descarta la cookie |
| `Login failed for user 'sa'` solo desde la app | La contraseña tiene un `#`: `node --env-file` lo toma como comentario y trunca el valor. Tampoco usar `; { } $ " '` |
| El `migrator` no arranca | La base no acepta autenticación SQL, o TCP/IP está deshabilitado, o el firewall bloquea el puerto |
| Se recreó un contenedor de otro proyecto | Falta `name: viandasweb` en el compose. Sin eso, Compose deriva el nombre de la carpeta (`infraestructura`), que colisiona con SGMIv2 |
| Búsquedas que no encuentran nombres con tilde | La base se creó con una collation sensible a acentos. La búsqueda de la pantalla de pedido es del lado del cliente y no depende de esto, pero conviene `COLLATE Latin1_General_CI_AI` |
| `P1001` en el `migrator`, pero la base se alcanza desde el host | La subred de Docker pisa la de la base. Ver la sección sobre `daemon.json` |
| `P3005: The database schema is not empty` | Base compartida sin `_prisma_migrations`. Hay que hacer el baseline una vez |
| El despliegue termina en verde pero sigue corriendo el código anterior | Falta `--force-recreate`: compose reconstruye la imagen y deja el contenedor viejo en pie. Se comprueba con `docker inspect viandas-web --format '{{.Image}}'` contra `docker image inspect viandas/web:latest --format '{{.Id}}'` |
| Todo verde pero contra la base equivocada | `DB_HOST=mssql` con `DB_MODE=external`: resuelve al contenedor de desarrollo por nombre de red. El paso `[1b]` ahora lo detecta |

Registro del despliegue: `deploy.log` en la raíz del repositorio.

## Copias de seguridad

Con `DB_MODE=external` el respaldo es responsabilidad del DBA de la compañía.

Con `DB_MODE=container`:

```bash
docker exec viandas-mssql /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P '<contraseña>' -N -C \
  -Q "BACKUP DATABASE viandas TO DISK='/var/opt/mssql/viandas.bak' WITH INIT"
docker cp viandas-mssql:/var/opt/mssql/viandas.bak ./viandas.bak
```

> **Nunca** correr `docker compose down -v`: la `-v` borra el volumen
> `viandasweb_mssql_data` y con él toda la base. `deploy.sh` jamás la usa.

## Notas

- Hace falta **Docker Compose v2**. La v1 no soporta `depends_on.required`,
  que es justo el mecanismo que permite conmutar entre base dockerizada y
  externa.
- No escalar la app a más de una instancia: el límite de intentos de ingreso
  se lleva en memoria y cada instancia contaría por su cuenta.
