# Puesta en marcha en el servidor

Guía para el servidor Windows con Git Bash y Docker. Repositorio:
`https://github.com/fomtbar/viandasweb`

La aplicación queda en **`http://<ip-del-servidor>:3100`**.

---

## Antes de empezar

### La base de datos ya existe y es compartida

La aplicación **no crea ninguna base**. Se conecta a una que ya está, que
comparte con otros sistemas, y sobre la que solo hace falta permiso para
**crear tablas**.

Todas sus tablas llevan el prefijo `viandas_`, así que no puede pisar nada de
lo que ya haya ahí:

```
viandas_sectores      viandas_empleados   viandas_pedidos
viandas_cargos        viandas_usuarios    viandas_pedido_items
viandas_turnos        viandas_motivos     viandas_usuario_preferencias
viandas_overtime_ventanas                 viandas_preferencias
```

Los índices y las restricciones también van prefijados. Esto último importa
más de lo que parece: en SQL Server los nombres de clave primaria, clave
foránea y valor por defecto son únicos **en toda la base**, no por tabla.

Hay una tabla más que Prisma crea para llevar la cuenta de las migraciones y
que **no se puede renombrar**:

```
_prisma_migrations
```

> **Verificá antes del primer despliegue que `_prisma_migrations` no exista
> ya** en esa base. Si otro sistema usa Prisma contra la misma base, van a
> pelearse por esa tabla y hay que hablarlo con el DBA antes de seguir.

```sql
SELECT name FROM sys.tables WHERE name = '_prisma_migrations';
```

### Lo que hay que pedirle al DBA

| Qué | Por qué |
|---|---|
| Usuario y contraseña SQL (modo mixto) | Desde un contenedor Linux no existe la autenticación integrada de Windows |
| Permiso para crear tablas en la base | El despliegue crea las `viandas_*` en el primer arranque |
| IP o nombre del servidor y puerto TCP | `localhost` no sirve (ver más abajo) |
| Que TCP/IP esté habilitado y el puerto abierto | Si no, el contenedor no llega |

**La contraseña no puede contener `#`.** El lector de variables de entorno de
Node lo toma como comienzo de comentario y corta el valor, aunque no haya
espacio delante. El síntoma es engañoso: `Login failed for user` sólo desde la
aplicación. Tampoco uses `;` `{` `}` `$` `"` `'`. Si te la imponen con alguno
de esos caracteres, avisá antes de desplegar.

### Requisitos del servidor

- Docker Desktop o Docker Engine **en modo Linux containers**, con
  **Compose v2** (`docker compose`, sin guion).
- Git Bash.
- Conexión a internet durante la primera construcción: baja la imagen de Node
  y corre `npm ci`.

---

## 1. Clonar

```bash
cd /c/   # o donde corresponda
git clone https://github.com/fomtbar/viandasweb.git
cd viandasweb
```

## 2. Escribir la configuración

**No uses el asistente de `deploy.sh`.** Está pensado para el caso de base
dockerizada y nunca se ejecutó en un servidor real; como ya tenés las
credenciales, escribir el archivo a mano es más directo y más seguro.

```bash
cd infraestructura
cat > .env <<'FIN'
DEPLOY_BRANCH=main

DB_MODE=external
DB_HOST=CAMBIAR
DB_PUERTO=1433
DB_NOMBRE=CAMBIAR
DB_USUARIO=CAMBIAR
DB_PASSWORD=CAMBIAR
DB_TRUST_CERT=true
DB_PUERTO_HOST=1433

APP_PUERTO=3100
APP_NOMBRE=Sistema de Viandas
AUTH_SECRET=CAMBIAR
COOKIE_SECURE=false
BCRYPT_ROUNDS=10
TZ=America/Argentina/Buenos_Aires
FIN

# Generar la clave de firma de sesión y pegarla en AUTH_SECRET
openssl rand -hex 32
```

Después editá el archivo y completá los `CAMBIAR`.

### Qué poner en `DB_HOST`

**Nunca `localhost` ni `127.0.0.1`**: desde adentro del contenedor eso apunta
al contenedor mismo. `deploy.sh` aborta si lo detecta.

| Dónde corre SQL Server | Valor |
|---|---|
| En este mismo servidor | `host.docker.internal` |
| En otra máquina de la red | Su IP o su nombre de red |

Si es una **instancia con nombre** (`SRVSQL\SQLEXPRESS`), la conexión por
host y puerto no la resuelve: pedí el **puerto TCP estático** de esa instancia
y ponelo en `DB_PUERTO`.

### Sobre `COOKIE_SECURE`

Dejalo en `false` mientras sirvas por HTTP. Con `true` sin HTTPS, el navegador
descarta la cookie de sesión y **el login entra en bucle sin mostrar ningún
error**. Es la falla más desconcertante de este tipo de despliegue.

## 3. Desplegar

```bash
cd ..
bash deploy.sh
```

Uso `bash deploy.sh` y no `./deploy.sh` por si el permiso de ejecución no
sobrevivió al clone.

El script hace: sanea el `.env` (BOM y fines de línea), comprueba el destino de
la base, `git pull`, construye las imágenes, levanta los contenedores, espera a
que estén sanos, crea o actualiza las tablas `viandas_*`, prueba
`/api/health` y limpia imágenes huérfanas. Deja registro en `deploy.log`.

Aborta si hay cambios locales sin confirmar, para no desplegar algo que no está
en el repositorio.

## 4. Abrir el puerto

```powershell
New-NetFirewallRule -DisplayName "viandasWeb 3100" -Direction Inbound `
  -Protocol TCP -LocalPort 3100 -Action Allow
```

## 5. Cargar la nómina (una sola vez)

El despliegue crea las tablas **vacías**. Los 806 empleados se importan desde
la SQLite de la aplicación de escritorio, y eso se corre una sola vez.

Lo más cómodo es hacerlo **desde tu PC de desarrollo**, apuntando a la base de
la compañía, porque el servidor no necesita tener Node instalado:

```bash
# En la PC de desarrollo, con acceso de red al SQL Server de la compañía
cd C:/proyectosDev/viandasWeb
cp /c/proyectosDev/viandas/viandas.db data/

# Editar .env de la raíz con los datos del SQL Server de la compañía:
#   DB_HOST, DB_PUERTO, DB_NOMBRE, DB_USUARIO, DB_PASSWORD
#   y DATABASE_URL con esos mismos valores

npm run db:import
```

Tarda alrededor de un minuto: recalcula las 806 contraseñas con bcrypt.

Al terminar imprime un resumen que tiene que dar 66 / 14 / 16 / 3 / 806 / 806 /
19 / 10 / 14 / 44.

**Cómo se entra la primera vez:** cada persona ingresa con su legajo como
usuario y como contraseña, y el sistema la obliga a cambiarla en el acto. La
nómina de origen ya trae **3 administradores** (el legajo 5169 entre ellos),
así que no hace falta tocar SQL para tener acceso de administración.

---

## Actualizaciones

```bash
cd /c/viandasweb
bash deploy.sh
```

Levanta los cambios del repositorio y aplica las migraciones nuevas si las hay.

---

## Convivencia con la otra aplicación del servidor

La otra aplicación ocupa el **3000 del host**. Ésta publica el 3100, así que no
se pisan: el 3000 que aparece en el `docker-compose.yml` es el puerto *interno*
del contenedor y cada contenedor tiene su propio espacio de red.

Lo que sí podría chocar, y ya está resuelto:

- **Nombre de proyecto de Compose**: el `docker-compose.yml` declara
  `name: viandasweb`. Sin eso, Compose lo deduce del nombre de la carpeta
  (`infraestructura`) y puede adoptar —y recrear— contenedores de otra pila que
  se orqueste desde una carpeta con el mismo nombre.
- **Nombres de contenedor**: usa `viandas-web` y `viandas-migrator`.
  Comprobá que la otra aplicación no los use:
  `docker ps -a --format '{{.Names}}'`
- El servicio `mssql` **no se levanta** con `DB_MODE=external`, así que no
  compite por el 1433.

---

## Diagnóstico

Lo primero: `http://<ip>:3100/api/health`. Devuelve el estado de la aplicación
y de la base, el valor de `COOKIE_SECURE` y la zona horaria.

| Síntoma | Causa |
|---|---|
| El login vuelve al login, sin ningún error | `COOKIE_SECURE=true` sirviendo por HTTP |
| `Login failed for user` sólo desde la aplicación | La contraseña tiene `#` y se truncó al leer el `.env` |
| El contenedor `viandas-migrator` falla | No llega a la base, o el usuario no puede crear tablas, o TCP/IP está deshabilitado |
| `deploy.sh` aborta diciendo que `DB_HOST` no sirve | Está en `localhost`; usá `host.docker.internal` o la IP |
| `There is already an object named 'viandas_...'` | Alguien creó tablas con ese prefijo por fuera del despliegue |

Registros:

```bash
docker logs viandas-web        # aplicación
docker logs viandas-migrator   # creación de tablas
cat deploy.log                 # último despliegue
```

---

## Cosas que NO hay que hacer

- **`docker compose down -v`**. La `-v` borra volúmenes. En este servidor la
  base es externa y no habría pérdida, pero es un reflejo peligroso de
  arrastrar. `deploy.sh` nunca la usa.
- **Escalar la aplicación a más de una instancia.** El límite de intentos de
  ingreso se lleva en memoria y cada instancia contaría por su cuenta.
- **Correr `prisma migrate dev` contra la base de la compañía.** Ese comando
  necesita crear una base sombra y no tiene permiso. En el servidor solo corre
  `prisma migrate deploy`, que no la necesita. Las migraciones nuevas se
  generan en la PC de desarrollo y se suben al repositorio.
