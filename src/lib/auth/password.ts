import bcrypt from "bcryptjs";

/**
 * bcryptjs (JS puro) y no bcrypt nativo: evita necesitar python3 y
 * build-essential en la imagen Docker. Si algun dia la sincronizacion masiva
 * de nomina se vuelve lenta, el reemplazo es @node-rs/bcrypt.
 *
 * Reemplaza al sha256(legajo) sin salt de la app Tkinter (auth.py:_hash).
 */
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

export function hashPassword(plano: string): Promise<string> {
  return bcrypt.hash(plano, ROUNDS);
}

export function verificarPassword(plano: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plano, hash);
}

/**
 * Hash real contra el que comparar cuando el legajo no existe, para que ese
 * login tarde lo mismo que uno con contrasena incorrecta. Sin esto, el tiempo
 * de respuesta revela que legajos tienen cuenta.
 *
 * Se genera una sola vez y de forma perezosa: tiene que ser un hash VALIDO,
 * porque bcrypt.compare contra una cadena mal formada retorna de inmediato y
 * arruinaria justamente la equiparacion de tiempos.
 */
let hashSenuelo: Promise<string> | null = null;

function obtenerHashSenuelo(): Promise<string> {
  hashSenuelo ??= bcrypt.hash(
    `senuelo-${Math.random().toString(36).slice(2)}`,
    ROUNDS,
  );
  return hashSenuelo;
}

/** Consume el mismo tiempo que una verificacion real y siempre da false. */
export async function verificacionSenuelo(plano: string): Promise<false> {
  await bcrypt.compare(plano, await obtenerHashSenuelo()).catch(() => false);
  return false;
}
