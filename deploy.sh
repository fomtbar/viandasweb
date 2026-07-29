#!/usr/bin/env bash
# =============================================================
#  viandasWeb - despliegue
#
#  Uso:
#    ./deploy.sh              despliegue normal
#    ./deploy.sh --setup      vuelve a correr el asistente de .env
#    ./deploy.sh --rama dev   fuerza una rama
#    ./deploy.sh --sin-pull   no toca git (util para probar local)
#
#  Sirve en Linux y en Windows con Git Bash. En el servidor Windows
#  conviene usar deploy.bat, que llama a deploy.ps1.
# =============================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA="$RAIZ/infraestructura"
ARCHIVO_ENV="$INFRA/.env"
EJEMPLO_ENV="$INFRA/.env.example"
BITACORA="$RAIZ/deploy.log"

SETUP=false
SIN_PULL=false
RAMA_FORZADA=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --setup)    SETUP=true; shift ;;
        --sin-pull) SIN_PULL=true; shift ;;
        --rama)     RAMA_FORZADA="${2:-}"; shift 2 ;;
        *) echo "Opción desconocida: $1"; exit 1 ;;
    esac
done

# ── Salida ───────────────────────────────────────────────────
rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }
paso()  { printf '\n\033[1m[%s]\033[0m %s\n' "$1" "$2"; }
morir() { rojo "ERROR: $*"; exit 1; }

exec > >(tee -a "$BITACORA") 2>&1
echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="

# ── Saneamiento del .env ─────────────────────────────────────
# Un .env con BOM hace que docker compose lea la primera clave como
# "﻿DEPLOY_BRANCH" y la variable simplemente no exista. Con CRLF, el \r
# se cuela dentro del valor. Las dos cosas se arreglan en silencio.
sanear_env() {
    [[ -f "$ARCHIVO_ENV" ]] || return 0
    sed -i '1s/^\xEF\xBB\xBF//' "$ARCHIVO_ENV"
    sed -i 's/\r$//' "$ARCHIVO_ENV"
}

leer_env() {
    [[ -f "$ARCHIVO_ENV" ]] || return 0
    grep -E "^\s*${1}\s*=" "$ARCHIVO_ENV" 2>/dev/null \
        | grep -v '^\s*#' | tail -1 | cut -d'=' -f2- | tr -d ' \r' || true
}

preguntar() {
    local etiqueta="$1" predeterminado="${2:-}" respuesta
    if [[ -n "$predeterminado" ]]; then
        read -r -p "  $etiqueta [$predeterminado]: " respuesta </dev/tty
        echo "${respuesta:-$predeterminado}"
    else
        read -r -p "  $etiqueta: " respuesta </dev/tty
        echo "$respuesta"
    fi
}

# Alfabeto sin  ; { } $ " ' #  : todos rompen algo (la cadena de conexión, la
# interpolación de compose, o el parseo del .env por parte de Node).
generar_password() {
    LC_ALL=C tr -dc 'A-Za-z0-9_!%^&*+=-' </dev/urandom | head -c 20
    echo
}

generar_secreto() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    else
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    fi
}

# ── [0] Asistente ────────────────────────────────────────────
asistente() {
    cat <<'FIN'

  ================================================
    viandasWeb - configuración inicial
  ================================================

  ¿Cómo llega esta máquina a la base de datos?
    container -> SQL Server 2022 en Docker (equipo de desarrollo)
    external  -> SQL Server de la compañía en la red (servidor)

FIN
    local modo host puerto base usuario password puerto_host
    modo=$(preguntar "Modo de base de datos (container/external)" "container")

    if [[ "$modo" == "external" ]]; then
        host=$(preguntar "IP o nombre del SQL Server" "")
        [[ -n "$host" ]] || morir "Hace falta el host del SQL Server."
        puerto=$(preguntar "Puerto" "1433")
        base=$(preguntar "Nombre de la base" "viandas")
        usuario=$(preguntar "Usuario SQL" "sa")
        read -r -s -p "  Contraseña SQL: " password </dev/tty; echo
        [[ -n "$password" ]] || morir "Hace falta la contraseña."
        case "$password" in
            *[\;\{\}\$\"\'\#]*)
                rojo "  Atención: la contraseña tiene alguno de estos caracteres: ; { } \$ \" ' #"
                rojo "  Van a romper la cadena de conexión o el parseo del .env."
                rojo "  Pedí al DBA una contraseña sin ellos, o encerrala en llaves: password={la;clave}"
                ;;
        esac
        puerto_host="1433"
    else
        host="mssql"
        puerto="1433"
        base=$(preguntar "Nombre de la base" "viandas")
        usuario="sa"
        password=$(preguntar "Contraseña para el sa del contenedor" "$(generar_password)")
        puerto_host=$(preguntar "Puerto del host para SQL Server" "14330")
    fi

    local puerto_app rama https cookie_secure secreto
    puerto_app=$(preguntar "Puerto de la aplicación" "3100")
    rama=$(preguntar "Rama de git" "main")
    https=$(preguntar "¿Servís por HTTPS? (s/n)" "n")
    if [[ "$https" =~ ^[SsYy] ]]; then cookie_secure="true"; else cookie_secure="false"; fi
    secreto=$(generar_secreto)

    # Se escribe con LF y sin BOM a proposito (ver sanear_env).
    cat > "$ARCHIVO_ENV" <<FIN
DEPLOY_BRANCH=$rama

DB_MODE=$modo
DB_HOST=$host
DB_PUERTO=$puerto
DB_NOMBRE=$base
DB_USUARIO=$usuario
DB_PASSWORD=$password
DB_TRUST_CERT=true
DB_PUERTO_HOST=$puerto_host

APP_PUERTO=$puerto_app
APP_NOMBRE=Sistema de Viandas
AUTH_SECRET=$secreto
COOKIE_SECURE=$cookie_secure
BCRYPT_ROUNDS=10
TZ=America/Argentina/Buenos_Aires
FIN

    verde "  Escrito: $ARCHIVO_ENV"
    if [[ "$modo" == "container" ]]; then
        cat <<FIN

  ------------------------------------------------
   GUARDÁ ESTO: contraseña del sa del contenedor
     $password
  ------------------------------------------------
FIN
    fi
}

paso 0 "Configuración"
if [[ "$SETUP" == true || ! -f "$ARCHIVO_ENV" ]]; then
    [[ -f "$EJEMPLO_ENV" ]] || morir "Falta $EJEMPLO_ENV; el repositorio está incompleto."
    asistente
else
    gris "Usando $ARCHIVO_ENV (--setup para rehacerlo)"
fi
sanear_env

DB_MODE="$(leer_env DB_MODE)"; DB_MODE="${DB_MODE:-container}"
RAMA="${RAMA_FORZADA:-$(leer_env DEPLOY_BRANCH)}"; RAMA="${RAMA:-main}"
APP_PUERTO="$(leer_env APP_PUERTO)"; APP_PUERTO="${APP_PUERTO:-3100}"
COOKIE_SECURE="$(leer_env COOKIE_SECURE)"

command -v docker >/dev/null 2>&1 || morir "Docker no está instalado o no está en el PATH."
docker info >/dev/null 2>&1 || morir "El demonio de Docker no responde. ¿Docker Desktop está abierto?"
# La v1 no soporta depends_on.required, que es justo el truco de DB_MODE.
docker compose version >/dev/null 2>&1 || morir "Hace falta Docker Compose v2 (docker compose, sin guion)."

PERFILES=(--profile app)
[[ "$DB_MODE" == "container" ]] && PERFILES+=(--profile container-db)

gris "Modo de base: $DB_MODE · rama: $RAMA · puerto: $APP_PUERTO"
if [[ "$COOKIE_SECURE" == "true" ]]; then
    rojo "  Atención: COOKIE_SECURE=true. Si no servís por HTTPS, el login va a"
    rojo "  entrar en bucle sin mostrar ningún error."
fi

# ── [1] Código ───────────────────────────────────────────────
paso 1 "Actualizando el código"
if [[ "$SIN_PULL" == true ]]; then
    gris "Omitido por --sin-pull"
elif [[ ! -d "$RAIZ/.git" ]]; then
    gris "No es un repositorio git: se omite el pull"
else
    cd "$RAIZ"
    if [[ -n "$(git status --porcelain)" ]]; then
        morir "Hay cambios locales sin confirmar. Guardalos o descartalos antes de desplegar."
    fi
    git fetch origin "$RAMA"
    git checkout "$RAMA"
    git pull origin "$RAMA"
    verde "En $(git rev-parse --short HEAD)"
fi

# ── [1b] Comprobación previa de la base ──────────────────────
# En producción la base YA EXISTE, es compartida con otros sistemas y solo hay
# permiso para crear tablas. Nada de este despliegue intenta crearla: si no
# está o no se llega, conviene enterarse acá y no dentro del contenedor.
if [[ "$DB_MODE" == "external" ]]; then
    paso 1b "Comprobando el acceso a la base"
    DB_HOST_ENV="$(leer_env DB_HOST)"
    DB_PUERTO_ENV="$(leer_env DB_PUERTO)"
    DB_NOMBRE_ENV="$(leer_env DB_NOMBRE)"

    if [[ "$DB_HOST_ENV" == "localhost" || "$DB_HOST_ENV" == "127.0.0.1" ]]; then
        morir "DB_HOST=$DB_HOST_ENV no sirve: desde adentro del contenedor apunta al contenedor mismo.
       Si SQL Server corre en este mismo servidor, usá  host.docker.internal
       Si corre en otra máquina, usá su IP o su nombre de red."
    fi
    gris "Destino: ${DB_HOST_ENV}:${DB_PUERTO_ENV}/${DB_NOMBRE_ENV} (base existente, no se crea)"
fi

# ── [2] Contenedores ─────────────────────────────────────────
paso 2 "Construyendo y levantando"
cd "$INFRA"
# El migrator corre solo y termina; la app espera a que salga bien.
# Solo crea/actualiza las tablas viandas_*; no toca nada mas de la base.
docker compose "${PERFILES[@]}" up -d --build

# ── [3] Salud ────────────────────────────────────────────────
esperar_sano() {
    local nombre="$1" limite="$2" transcurrido=0 estado
    printf '  %s ' "$nombre"
    while [[ $transcurrido -lt $limite ]]; do
        estado="$(docker inspect --format '{{.State.Health.Status}}' "$nombre" 2>/dev/null || echo ausente)"
        case "$estado" in
            healthy)   verde "OK (${transcurrido}s)"; return 0 ;;
            unhealthy) rojo "sin salud"; docker logs --tail 30 "$nombre"; return 1 ;;
        esac
        sleep 5; transcurrido=$((transcurrido + 5)); printf '.'
    done
    rojo "tiempo agotado (${limite}s)"
    docker logs --tail 30 "$nombre"
    return 1
}

paso 3 "Verificando el estado"
if [[ "$DB_MODE" == "container" ]]; then
    esperar_sano viandas-mssql 180 || morir "SQL Server no llegó a estar sano."
fi
esperar_sano viandas-web 180 || morir "La aplicación no llegó a estar sana."

# ── [4] Migraciones ──────────────────────────────────────────
paso 4 "Migraciones"
if docker logs viandas-migrator 2>&1 | grep -q "No pending migrations"; then
    gris "Sin migraciones pendientes (las tablas viandas_* ya están al día)."
else
    docker logs viandas-migrator 2>&1 | tail -5
fi

# ── [5] Prueba de humo ───────────────────────────────────────
paso 5 "Prueba de humo"
if curl -fsS "http://localhost:${APP_PUERTO}/api/health" >/dev/null 2>&1; then
    verde "  /api/health responde correctamente"
else
    morir "La aplicación no responde en el puerto ${APP_PUERTO}."
fi

# ── [6] Limpieza ─────────────────────────────────────────────
paso 6 "Limpieza"
# Nunca se usa -v: eso borraria el volumen de la base.
docker image prune -f >/dev/null
gris "Imágenes huérfanas eliminadas."

# ── [7] Resumen ──────────────────────────────────────────────
paso 7 "Listo"
docker compose "${PERFILES[@]}" ps --format 'table {{.Name}}\t{{.Status}}'

IP_LAN="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -z "$IP_LAN" ]] && IP_LAN="<ip-del-servidor>"
echo
verde "  Disponible en: http://${IP_LAN}:${APP_PUERTO}"
gris  "  Bitácora: $BITACORA"
echo
