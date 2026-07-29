# ==========================================================
#  viandasWeb - Next.js standalone + Prisma 7 (SQL Server)
#
#  Se usa Debian slim y no Alpine: aunque Prisma 7 ya no lleva
#  query engine nativo (habla SQL Server por @prisma/adapter-mssql,
#  que es JavaScript puro sobre tedious), Alpine sigue dando
#  sorpresas con musl en dependencias transitivas. Los ~40 MB de
#  mas compran que funcione a la primera.
# ==========================================================

# ── Etapa 1: dependencias ─────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Etapa 2: compilacion ──────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_APP_NAME="Sistema de Viandas"
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_TELEMETRY_DISABLED=1

# La compilacion NO debe tocar la base: todas las paginas estan marcadas como
# dinamicas. Estas variables existen solo para que `prisma generate` y el
# arranque del modulo no fallen por una variable ausente.
ENV DATABASE_URL="sqlserver://build:1433;database=build;user=sa;password=build;trustServerCertificate=true"
ENV DB_HOST=build DB_PUERTO=1433 DB_NOMBRE=build DB_USUARIO=sa DB_PASSWORD=build
ENV AUTH_SECRET="solo-para-compilar-no-se-usa-en-ejecucion-000000"

RUN npx prisma generate
RUN npm run build

# ── Etapa 3: ejecucion ────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TZ=America/Argentina/Buenos_Aires

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# La salida standalone trae su propio server.js con las dependencias ya
# rastreadas.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Esta imagen NO lleva el CLI de Prisma a proposito.
#
# Se intento y no conviene: la salida standalone no genera node_modules/.bin,
# y copiar a mano `prisma` + `@prisma` deja afuera dependencias transitivas
# del CLI (empezando por `effect`). Perseguirlas una por una es fragil.
#
# Las migraciones las aplica el servicio `migrator` de
# infraestructura/docker-compose.yml, que reutiliza la etapa `builder` (donde
# el CLI ya esta completo) y corre una sola vez antes de levantar la app.

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
