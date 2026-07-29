#Requires -Version 5.1
# =============================================================
#  viandasWeb - despliegue (Windows Server)
#
#  Uso:
#    .\deploy.ps1                 despliegue normal
#    .\deploy.ps1 -Setup          vuelve a correr el asistente de .env
#    .\deploy.ps1 -Rama dev       fuerza una rama
#    .\deploy.ps1 -SinPull        no toca git
#
#  IMPORTANTE: este archivo se guarda en UTF-8 CON BOM. Sin el BOM,
#  PowerShell 5.1 lo lee como ANSI y los acentos salen mal.
#  El .env, en cambio, se escribe SIN BOM (ver Write-EnvFile).
# =============================================================
[CmdletBinding()]
param(
    [switch]$Setup,
    [switch]$SinPull,
    [string]$Rama = ""
)

$ErrorActionPreference = "Stop"

$Raiz        = Split-Path -Parent $MyInvocation.MyCommand.Path
$Infra       = Join-Path $Raiz "infraestructura"
$ArchivoEnv  = Join-Path $Infra ".env"
$EjemploEnv  = Join-Path $Infra ".env.example"
$Bitacora    = Join-Path $Raiz "deploy.log"

function Escribir { param([string]$Texto, [string]$Color = "Gray")
    Write-Host $Texto -ForegroundColor $Color
    Add-Content -Path $Bitacora -Value $Texto -Encoding utf8
}
function Paso  { param([string]$N, [string]$T) Write-Host ""; Escribir "[$N] $T" "White" }
function Verde { param([string]$T) Escribir "  $T" "Green" }
function Rojo  { param([string]$T) Escribir "  $T" "Red" }
function Morir { param([string]$T) Rojo "ERROR: $T"; exit 1 }

Escribir "===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====="

# ── .env sin BOM y con LF ────────────────────────────────────
# Set-Content -Encoding UTF8 en PowerShell 5.1 escribe CON BOM, y entonces
# docker compose lee la primera clave como "﻿DEPLOY_BRANCH" y la variable
# desaparece. Hay que forzar UTF8Encoding($false).
function Write-EnvFile {
    param([string[]]$Lineas)
    $sinBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ArchivoEnv, (($Lineas -join "`n") + "`n"), $sinBom)
}

function Repair-EnvFile {
    if (-not (Test-Path $ArchivoEnv)) { return }
    $texto = [System.IO.File]::ReadAllText($ArchivoEnv)
    $texto = $texto -replace "^﻿", ""
    $texto = $texto -replace "`r`n", "`n"
    $sinBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ArchivoEnv, $texto, $sinBom)
}

function Read-Env {
    param([string]$Clave)
    if (-not (Test-Path $ArchivoEnv)) { return "" }
    $linea = Get-Content $ArchivoEnv | Where-Object { $_ -match "^\s*$Clave\s*=" } | Select-Object -Last 1
    if (-not $linea) { return "" }
    return ($linea -split "=", 2)[1].Trim()
}

function Preguntar {
    param([string]$Etiqueta, [string]$Predeterminado = "")
    if ($Predeterminado) {
        $r = Read-Host "  $Etiqueta [$Predeterminado]"
        if ([string]::IsNullOrWhiteSpace($r)) { return $Predeterminado }
        return $r.Trim()
    }
    return (Read-Host "  $Etiqueta").Trim()
}

# Alfabeto sin  ; { } $ " ' #  : rompen la cadena de conexión, la interpolación
# de compose o el parseo del .env desde Node.
function New-Password {
    $alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_!%^&*+=-"
    -join (1..20 | ForEach-Object { $alfabeto[(Get-Random -Maximum $alfabeto.Length)] })
}

function New-Secreto {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

# ── [0] Asistente ────────────────────────────────────────────
function Invoke-Asistente {
    Write-Host ""
    Write-Host "  ================================================" -ForegroundColor Cyan
    Write-Host "    viandasWeb - configuración inicial"           -ForegroundColor Cyan
    Write-Host "  ================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  ¿Cómo llega esta máquina a la base de datos?"
    Write-Host "    container -> SQL Server 2022 en Docker (equipo de desarrollo)"
    Write-Host "    external  -> SQL Server de la compañía en la red (servidor)"
    Write-Host ""

    $modo = Preguntar "Modo de base de datos (container/external)" "container"

    if ($modo -eq "external") {
        $dbHost = Preguntar "IP o nombre del SQL Server"
        if (-not $dbHost) { Morir "Hace falta el host del SQL Server." }
        $puerto  = Preguntar "Puerto" "1433"
        $base    = Preguntar "Nombre de la base" "viandas"
        $usuario = Preguntar "Usuario SQL" "sa"
        $segura  = Read-Host "  Contraseña SQL" -AsSecureString
        $password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
        if (-not $password) { Morir "Hace falta la contraseña." }
        if ($password -match '[;{}$"''#]') {
            Rojo "Atención: la contraseña tiene alguno de estos caracteres: ; { } `$ `" ' #"
            Rojo "Van a romper la cadena de conexión o el parseo del .env."
        }
        $puertoHost = "1433"
    }
    else {
        $dbHost     = "mssql"
        $puerto     = "1433"
        $base       = Preguntar "Nombre de la base" "viandas"
        $usuario    = "sa"
        $password   = Preguntar "Contraseña para el sa del contenedor" (New-Password)
        $puertoHost = Preguntar "Puerto del host para SQL Server" "14330"
    }

    $puertoApp = Preguntar "Puerto de la aplicación" "3100"
    $ramaGit   = Preguntar "Rama de git" "main"
    $https     = Preguntar "¿Servís por HTTPS? (s/n)" "n"
    $cookieSecure = if ($https -match '^[SsYy]') { "true" } else { "false" }

    Write-EnvFile @(
        "DEPLOY_BRANCH=$ramaGit",
        "",
        "DB_MODE=$modo",
        "DB_HOST=$dbHost",
        "DB_PUERTO=$puerto",
        "DB_NOMBRE=$base",
        "DB_USUARIO=$usuario",
        "DB_PASSWORD=$password",
        "DB_TRUST_CERT=true",
        "DB_PUERTO_HOST=$puertoHost",
        "",
        "APP_PUERTO=$puertoApp",
        "APP_NOMBRE=Sistema de Viandas",
        "AUTH_SECRET=$(New-Secreto)",
        "COOKIE_SECURE=$cookieSecure",
        "BCRYPT_ROUNDS=10",
        "TZ=America/Argentina/Buenos_Aires"
    )

    Verde "Escrito: $ArchivoEnv"
    if ($modo -eq "container") {
        Write-Host ""
        Write-Host "  ------------------------------------------------" -ForegroundColor Yellow
        Write-Host "   GUARDÁ ESTO: contraseña del sa del contenedor"   -ForegroundColor Yellow
        Write-Host "     $password"                                     -ForegroundColor Yellow
        Write-Host "  ------------------------------------------------" -ForegroundColor Yellow
    }
}

Paso 0 "Configuración"
if ($Setup -or -not (Test-Path $ArchivoEnv)) {
    if (-not (Test-Path $EjemploEnv)) { Morir "Falta $EjemploEnv; el repositorio está incompleto." }
    Invoke-Asistente
}
else {
    Escribir "  Usando $ArchivoEnv (-Setup para rehacerlo)"
}
Repair-EnvFile

$DbMode      = Read-Env "DB_MODE";      if (-not $DbMode) { $DbMode = "container" }
$RamaFinal   = if ($Rama) { $Rama } else { Read-Env "DEPLOY_BRANCH" }
if (-not $RamaFinal) { $RamaFinal = "main" }
$PuertoApp   = Read-Env "APP_PUERTO";   if (-not $PuertoApp) { $PuertoApp = "3100" }
$CookieSecure = Read-Env "COOKIE_SECURE"

try { docker info | Out-Null } catch { Morir "El demonio de Docker no responde. ¿Docker Desktop está abierto?" }
try { docker compose version | Out-Null } catch { Morir "Hace falta Docker Compose v2 (docker compose, sin guion)." }

$Perfiles = @("--profile", "app")
if ($DbMode -eq "container") { $Perfiles += @("--profile", "container-db") }

Escribir "  Modo de base: $DbMode · rama: $RamaFinal · puerto: $PuertoApp"
if ($CookieSecure -eq "true") {
    Rojo "Atención: COOKIE_SECURE=true. Si no servís por HTTPS, el login va a"
    Rojo "entrar en bucle sin mostrar ningún error."
}

# ── [1] Código ───────────────────────────────────────────────
Paso 1 "Actualizando el código"
if ($SinPull) {
    Escribir "  Omitido por -SinPull"
}
elseif (-not (Test-Path (Join-Path $Raiz ".git"))) {
    Escribir "  No es un repositorio git: se omite el pull"
}
else {
    Push-Location $Raiz
    try {
        $sucio = git status --porcelain
        if ($sucio) { Morir "Hay cambios locales sin confirmar. Guardalos o descartalos antes de desplegar." }
        git fetch origin $RamaFinal
        if (-not $?) { Morir "No se pudo hacer fetch de origin/$RamaFinal." }
        git checkout $RamaFinal
        git pull origin $RamaFinal
        if (-not $?) { Morir "No se pudo hacer pull de origin/$RamaFinal." }
        Verde "En $(git rev-parse --short HEAD)"
    }
    finally { Pop-Location }
}

# ── [1b] Comprobación previa de la base ──────────────────────
# En producción la base YA EXISTE, es compartida con otros sistemas y solo hay
# permiso para crear tablas. Si no se llega, conviene enterarse acá y no dentro
# del contenedor, donde el error es un P1001 mucho menos explícito.
if ($DbMode -eq "external") {
    Paso "1b" "Comprobando el acceso a la base"
    $DbHostEnv = Read-Env "DB_HOST"
    $DbPuertoEnv = Read-Env "DB_PUERTO"
    $DbNombreEnv = Read-Env "DB_NOMBRE"

    if ($DbHostEnv -eq "localhost" -or $DbHostEnv -eq "127.0.0.1") {
        Morir "DB_HOST=$DbHostEnv no sirve: desde adentro del contenedor apunta al contenedor mismo.
       Si SQL Server corre en este mismo servidor, usá  host.docker.internal
       Si corre en otra máquina, usá su IP o su nombre de red."
    }
    Escribir "  Destino: ${DbHostEnv}:${DbPuertoEnv}/${DbNombreEnv} (base existente, no se crea)"

    # Alcance desde el host.
    if (Test-NetConnection -ComputerName $DbHostEnv -Port $DbPuertoEnv -InformationLevel Quiet -WarningAction SilentlyContinue) {
        Verde "El host llega a ${DbHostEnv}:${DbPuertoEnv}"
    }
    else {
        Morir "No hay TCP a ${DbHostEnv}:${DbPuertoEnv} desde este equipo.
       Revisá el puerto (SQL Server suele escuchar en 1433; 14330 es el del
       contenedor de desarrollo), el firewall y que la instancia acepte TCP/IP."
    }

    # Alcance desde un contenedor. El host puede llegar y el contenedor no: pasa
    # cuando la subred de Docker se superpone con la de la base. Docker usa
    # 172.17.0.0/16 para docker0 y reparte 172.17-172.31 entre las redes de los
    # proyectos; si la base vive en ese rango, la VM de Docker cree que la IP es
    # local a su propio bridge y nunca la rutea a la red.
    & docker run --rm --quiet busybox true 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        & docker run --rm busybox timeout 5 nc -z $DbHostEnv $DbPuertoEnv 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Verde "Un contenedor también llega a ${DbHostEnv}:${DbPuertoEnv}"
        }
        else {
            Rojo "El host llega pero un contenedor NO."
            Rojo "Casi seguro: la subred de Docker se superpone con la de la base."
            Rojo "Comprobalo con:"
            Rojo "    docker run --rm --network host busybox ip route"
            Rojo "Si ves una ruta que contiene a $DbHostEnv (p. ej. 172.17.0.0/16"
            Rojo "en docker0), mové Docker fuera de ese rango. En daemon.json:"
            Rojo '    "bip": "10.99.0.1/24",'
            Rojo '    "default-address-pools": [ { "base": "10.100.0.0/16", "size": 24 } ]'
            Rojo "y reiniciá Docker. Ver infraestructura/DEPLOYMENT.md."
            Morir "El contenedor no alcanza la base; el despliegue fallaría igual, pero más tarde."
        }
    }
    else {
        Escribir "  (sin imagen busybox a mano: se omite la prueba desde el contenedor)"
    }
}

# ── [2] Contenedores ─────────────────────────────────────────
Paso 2 "Construyendo y levantando"
Push-Location $Infra
try {
    # --force-recreate NO es opcional: sin el, cuando el contenedor de la app ya
    # esta corriendo, compose reconstruye la imagen pero deja el contenedor
    # viejo en pie ("Running" en vez de "Recreated") y el despliegue termina en
    # verde sirviendo el codigo anterior. Ya paso.
    & docker compose @Perfiles up -d --build --force-recreate
    if ($LASTEXITCODE -ne 0) { Morir "Falló el levantamiento de los contenedores." }
}
finally { Pop-Location }

# ── [3] Salud ────────────────────────────────────────────────
function Wait-Sano {
    param([string]$Nombre, [int]$Limite)
    $transcurrido = 0
    Write-Host "  $Nombre " -NoNewline
    while ($transcurrido -lt $Limite) {
        $estado = docker inspect --format '{{.State.Health.Status}}' $Nombre 2>$null
        if ($estado -eq "healthy")   { Write-Host "OK ($transcurrido s)" -ForegroundColor Green; return $true }
        if ($estado -eq "unhealthy") { Write-Host "sin salud" -ForegroundColor Red; docker logs --tail 30 $Nombre; return $false }
        Start-Sleep -Seconds 5
        $transcurrido += 5
        Write-Host "." -NoNewline
    }
    Write-Host "tiempo agotado ($Limite s)" -ForegroundColor Red
    docker logs --tail 30 $Nombre
    return $false
}

Paso 3 "Verificando el estado"
if ($DbMode -eq "container") {
    if (-not (Wait-Sano "viandas-mssql" 180)) { Morir "SQL Server no llegó a estar sano." }
}
if (-not (Wait-Sano "viandas-web" 180)) { Morir "La aplicación no llegó a estar sana." }

# ── [4] Migraciones ──────────────────────────────────────────
Paso 4 "Migraciones"
$logMigrator = docker logs viandas-migrator 2>&1 | Out-String
if ($logMigrator -match "No pending migrations") {
    Escribir "  Sin migraciones pendientes."
}
else {
    ($logMigrator -split "`n" | Select-Object -Last 5) | ForEach-Object { Escribir "  $_" }
}

# ── [5] Prueba de humo ───────────────────────────────────────
Paso 5 "Prueba de humo"
try {
    $salud = Invoke-RestMethod -Uri "http://localhost:$PuertoApp/api/health" -TimeoutSec 15
    if ($salud.status -eq "ok") { Verde "/api/health responde correctamente" }
    else { Morir "La aplicación responde pero sin salud: $($salud | ConvertTo-Json -Compress)" }
}
catch { Morir "La aplicación no responde en el puerto $PuertoApp." }

# ── [6] Limpieza ─────────────────────────────────────────────
Paso 6 "Limpieza"
# Nunca se usa -v: eso borraría el volumen de la base.
docker image prune -f | Out-Null
Escribir "  Imágenes huérfanas eliminadas."

# ── [7] Resumen ──────────────────────────────────────────────
Paso 7 "Listo"
Push-Location $Infra
try { & docker compose @Perfiles ps --format "table {{.Name}}`t{{.Status}}" }
finally { Pop-Location }

$ipLan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1).IPAddress
if (-not $ipLan) { $ipLan = "<ip-del-servidor>" }

Write-Host ""
Verde "Disponible en: http://${ipLan}:$PuertoApp"
Escribir "  Bitácora: $Bitacora"
Write-Host ""
