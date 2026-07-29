/**
 * Chequeos de la fase 2 (autenticacion) contra el servidor de desarrollo.
 *
 * Ademas de probar las funciones, forja cookies de sesion validas y las manda
 * por HTTP: asi se ejercita el camino real middleware -> guard -> Prisma.
 *
 *   npm run dev                                          (en otra terminal)
 *   npx tsx --env-file=.env scripts/verificar-fase2.ts
 */
import { prisma } from "@/lib/prisma";
import { verificarPassword } from "@/lib/auth/password";
import { firmarSesion, COOKIE_SESION } from "@/lib/auth/sesion";
import { aPayloadSesion, tieneAcceso } from "@/server/usuarios";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
let fallos = 0;

function chequear(descripcion: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`  ${ok ? "ok  " : "FALLA"}  ${descripcion}`);
  if (!ok) console.log(`         esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(real)}`);
}

/** Pide una URL sin seguir redirecciones y devuelve estado + destino. */
async function pedir(ruta: string, cookie?: string) {
  const res = await fetch(`${BASE}${ruta}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  const destino = res.headers.get("location");
  return {
    estado: res.status,
    destino: destino ? destino.replace(BASE, "") : null,
    cookies: res.headers.getSetCookie?.() ?? [],
  };
}

async function main() {
  console.log("\n=== Verificacion fase 2 (auth) ===\n");

  const incluir = {
    empleado: { include: { cargo: true, sector: true } },
    sectorDefault: true,
  } as const;

  const admin = await prisma.usuario.findFirst({ where: { esAdmin: true }, include: incluir });
  const gl = await prisma.usuario.findFirst({
    where: { esGl: true, esAdmin: false },
    include: incluir,
  });
  const sinAcceso = await prisma.usuario.findFirst({
    where: { esGl: false, esAdmin: false },
    include: incluir,
  });

  if (!admin || !gl || !sinAcceso) throw new Error("Faltan usuarios de prueba en la base.");
  console.log(`  usuarios de prueba: admin ${admin.legajo} · GL ${gl.legajo} · sin acceso ${sinAcceso.legajo}\n`);

  // ── Contrasenas ──
  chequear(
    "la contrasena inicial es el legajo",
    await verificarPassword(String(gl.legajo), gl.passwordHash),
    true,
  );
  chequear(
    "una contrasena incorrecta no valida",
    await verificarPassword("cualquier-otra", gl.passwordHash),
    false,
  );
  chequear("el hash es bcrypt", gl.passwordHash.startsWith("$2b$"), true);

  // ── Reglas de acceso ──
  chequear("un GL tiene acceso", tieneAcceso(gl), true);
  chequear("un admin tiene acceso", tieneAcceso(admin), true);
  chequear("sin es_gl ni es_admin no hay acceso", tieneAcceso(sinAcceso), false);

  // ── Sin cookie ──
  chequear("/ sin sesion redirige a /login", (await pedir("/")).destino, "/login");
  chequear("/login sin sesion responde 200", (await pedir("/login")).estado, 200);
  chequear(
    "/historial sin sesion conserva el destino",
    (await pedir("/historial")).destino,
    "/login?next=%2Fhistorial",
  );
  chequear("/api/health es publico", (await pedir("/api/health")).estado, 200);

  // ── Con cookie de un GL que todavia debe cambiar la clave ──
  const cookieForzado = `${COOKIE_SESION}=${await firmarSesion({
    ...aPayloadSesion(gl),
    debeCambiar: true,
  })}`;
  chequear(
    "con cambio pendiente, / manda a /cambiar-password",
    (await pedir("/", cookieForzado)).destino,
    "/cambiar-password",
  );
  chequear(
    "con cambio pendiente, /historial tambien",
    (await pedir("/historial", cookieForzado)).destino,
    "/cambiar-password",
  );
  chequear(
    "con cambio pendiente, /cambiar-password abre",
    (await pedir("/cambiar-password", cookieForzado)).estado,
    200,
  );

  // ── Con cookie de un GL ya al dia ──
  // El guard relee la base, asi que no alcanza con mentir en el payload:
  // hay que dejar al usuario efectivamente al dia.
  await prisma.usuario.update({
    where: { id: gl.id },
    data: { debeCambiarPassword: false },
  });
  const cookieGl = `${COOKIE_SESION}=${await firmarSesion({
    ...aPayloadSesion(gl),
    debeCambiar: false,
  })}`;
  chequear("un GL al dia entra a /", (await pedir("/", cookieGl)).estado, 200);
  chequear(
    "un GL no entra a /admin",
    (await pedir("/admin", cookieGl)).destino,
    "/",
  );
  chequear(
    "con sesion, /login redirige a /",
    (await pedir("/login", cookieGl)).destino,
    "/",
  );
  chequear(
    "/cambiar-password sin ?voluntario redirige a /",
    (await pedir("/cambiar-password", cookieGl)).destino,
    "/",
  );
  chequear(
    "/cambiar-password?voluntario=1 abre",
    (await pedir("/cambiar-password?voluntario=1", cookieGl)).estado,
    200,
  );

  // Restaura el estado real del usuario de prueba.
  await prisma.usuario.update({
    where: { id: gl.id },
    data: { debeCambiarPassword: gl.debeCambiarPassword },
  });

  // ── Cookie de alguien sin rol: el guard lo expulsa aunque el JWT sea valido ──
  const cookieSinAcceso = `${COOKIE_SESION}=${await firmarSesion({
    ...aPayloadSesion(sinAcceso),
    esGl: true, // el payload MIENTE a proposito
    debeCambiar: false,
  })}`;
  chequear(
    "un payload que miente sobre el rol no sirve: el guard relee la base",
    (await pedir("/", cookieSinAcceso)).destino,
    "/login?motivo=sin-acceso",
  );

  // ── Cookie firmada con otra clave ──
  const cookieFalsa = `${COOKIE_SESION}=eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjEsImVzQWRtaW4iOnRydWV9.firma-invalida`;
  chequear(
    "una cookie con firma invalida se ignora",
    (await pedir("/", cookieFalsa)).destino,
    "/login",
  );

  // ── Invalidacion por cambio de contrasena ──
  const cookieVieja = `${COOKIE_SESION}=${await firmarSesion({
    ...aPayloadSesion(gl),
    debeCambiar: false,
    pwdAt: 0,
  })}`;
  const antes = gl.passwordActualizadoAt;
  await prisma.usuario.update({
    where: { id: gl.id },
    data: { passwordActualizadoAt: new Date() },
  });
  chequear(
    "una sesion anterior a un reset de clave queda invalidada",
    (await pedir("/", cookieVieja)).destino,
    "/login?motivo=password-cambiada",
  );
  await prisma.usuario.update({
    where: { id: gl.id },
    data: { passwordActualizadoAt: antes },
  });

  // La expulsion tiene que BORRAR la cookie, si no el JWT sigue valido y
  // /login rebota a / en bucle.
  const respuestaLogin = await pedir("/login?motivo=sin-acceso", cookieGl);
  chequear("al expulsar, /login?motivo abre (no rebota)", respuestaLogin.estado, 200);
  chequear(
    "al expulsar, la cookie de sesion se borra",
    respuestaLogin.cookies.some(
      (c) => c.startsWith(`${COOKIE_SESION}=`) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c),
    ),
    true,
  );

  console.log(fallos === 0 ? "\nTodo OK.\n" : `\n${fallos} chequeo(s) fallaron.\n`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\nERROR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
