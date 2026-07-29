import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Sesion con JWT HS256 en cookie httpOnly.
 *
 * Se usa `jose` y no NextAuth ni iron-session porque:
 *  - NextAuth esta pensado para OAuth; para un unico credentials provider
 *    contra nuestra tabla `usuarios` agrega un adapter y tablas que no
 *    queremos.
 *  - iron-session cifra el payload, y aca no hay nada secreto que ocultar:
 *    legajo, nombre y dos flags.
 *  - jose es Web Crypto puro y corre en el runtime Edge del middleware, que
 *    es donde hay que validar en cada request.
 *
 * El payload NO es la autoridad sobre permisos: las mutaciones revalidan
 * contra la base con requireUsuarioFresco() (ver guards.ts).
 */

export const COOKIE_SESION = "viandas_sesion";
const DURACION_SEGUNDOS = 8 * 60 * 60;
const EMISOR = "viandasWeb";

export interface PayloadSesion {
  /** usuarios.id */
  uid: number;
  legajo: number;
  /** apellido_nombre, para el encabezado */
  nombre: string;
  sectorId: number | null;
  sectorNombre: string | null;
  cargo: string | null;
  esGl: boolean;
  esAdmin: boolean;
  /** debeCambiarPassword */
  debeCambiar: boolean;
  /** passwordActualizadoAt en segundos epoch (0 si nunca). Invalida sesiones viejas. */
  pwdAt: number;
}

function clave(): Uint8Array {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new Error(
      "AUTH_SECRET falta o es demasiado corta (se esperan 32+ caracteres). " +
        'Generar con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return new TextEncoder().encode(secreto);
}

export async function firmarSesion(payload: PayloadSesion): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(EMISOR)
    .setAudience(EMISOR)
    .setExpirationTime(`${DURACION_SEGUNDOS}s`)
    .sign(clave());
}

/** Verifica y decodifica. Devuelve null ante cualquier problema. */
export async function leerSesionDeToken(
  token: string | undefined,
): Promise<PayloadSesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clave(), {
      issuer: EMISOR,
      audience: EMISOR,
    });
    return payload as unknown as PayloadSesion;
  } catch {
    return null;
  }
}

/** Lee la sesion de la cookie del request actual (runtime Node). */
export async function leerSesion(): Promise<PayloadSesion | null> {
  const almacen = await cookies();
  return leerSesionDeToken(almacen.get(COOKIE_SESION)?.value);
}

export async function establecerCookieSesion(payload: PayloadSesion) {
  const almacen = await cookies();
  almacen.set(COOKIE_SESION, await firmarSesion(payload), {
    httpOnly: true,
    // OJO: en produccion la app se sirve por http://<ip>:3100 en la LAN, sin
    // TLS. Con secure:true el navegador descarta la cookie y el login entra
    // en bucle infinito sin ningun mensaje de error.
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SEGUNDOS,
  });
}

export async function destruirSesion() {
  const almacen = await cookies();
  almacen.delete(COOKIE_SESION);
}
