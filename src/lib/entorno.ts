/**
 * Guardia para las operaciones que destruyen datos.
 *
 * La regla es fail-closed: sin la marca explicita `PERMITIR_DESTRUCTIVO=si`
 * NADA destructivo corre. Olvidarse de declararla bloquea la operacion; nunca
 * al reves. Es a proposito: la alternativa (intentar adivinar si la base es de
 * produccion mirando el host o el nombre) falla justo el dia que alguien clona
 * la base o le cambia el nombre.
 *
 * La marca va SOLO en el .env de desarrollo. En el servidor no existe, y por
 * eso alcanza con no ponerla para que el importador con --truncate y las
 * pruebas e2e se nieguen a arrancar.
 *
 * No lleva `server-only`: lo importan los scripts de `scripts/` y el
 * globalSetup de Playwright, que corren fuera del bundler de Next.
 */

const MARCA = "PERMITIR_DESTRUCTIVO";

/** Descripcion de la base apuntada, para que el mensaje de error sea util. */
export function destinoActual(): string {
  const host = process.env.DB_HOST ?? "(sin DB_HOST)";
  const puerto = process.env.DB_PUERTO ?? "1433";
  const base = process.env.DB_NOMBRE ?? "(sin DB_NOMBRE)";
  return `${host}:${puerto}/${base}`;
}

export function entornoPermiteDestruir(): boolean {
  return (process.env[MARCA] ?? "").trim().toLowerCase() === "si";
}

/**
 * Aborta si el entorno no esta declarado como descartable.
 *
 * @param operacion Que se iba a hacer, en infinitivo: "vaciar la base",
 *                  "correr las pruebas e2e". Aparece en el mensaje.
 */
export function exigirEntornoDestruible(operacion: string): void {
  if (entornoPermiteDestruir()) return;

  throw new Error(
    [
      "",
      `  Se intento ${operacion} sin autorizacion del entorno.`,
      "",
      `  Destino: ${destinoActual()}`,
      "",
      `  Esta operacion borra o pisa datos, asi que exige ${MARCA}=si en el`,
      "  .env. Esa marca va UNICAMENTE en equipos de desarrollo con la base",
      "  dockerizada. Si estas apuntando a la base de la compania, no la",
      "  agregues: busca el .env de desarrollo.",
      "",
    ].join("\n"),
  );
}
