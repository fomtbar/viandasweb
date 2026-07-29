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

## Primer despliegue en el servidor Windows

Antes de empezar, **confirmar con el DBA** que el SQL Server de la compañía:

1. Acepta **autenticación SQL** (modo mixto). Desde un contenedor Linux no hay
   forma de usar autenticación integrada de Windows: si el servidor solo
   admite eso, este despliegue no es posible sin replantear la arquitectura.
2. Tiene **TCP/IP habilitado** en SQL Server Configuration Manager.
3. Tiene el puerto abierto en el firewall.
4. Provee un login con permisos `db_owner` sobre la base `viandas`.

Después:

```bat
git clone <repositorio> C:\viandasWeb
cd C:\viandasWeb
deploy.bat
```

El asistente pregunta el modo (`external`), los datos de conexión, el puerto y
la rama, y genera `infraestructura\.env`. A partir de ahí, cada actualización
es simplemente `deploy.bat`.

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
en el primer ingreso. **Nadie queda como administrador**: hay que promover a
alguien a mano la primera vez.

```sql
UPDATE usuarios SET es_admin = 1 WHERE legajo = <legajo>;
```

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
