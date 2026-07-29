import "server-only";

/**
 * Límite de intentos de ingreso.
 *
 * En memoria y no en la base: la app corre en un solo contenedor y esto no
 * necesita sobrevivir a un reinicio. Si algún día se escala a varias
 * instancias hay que moverlo a Redis o a una tabla, porque cada instancia
 * llevaría su propia cuenta.
 *
 * La clave combina legajo e IP: así un atacante que prueba contraseñas contra
 * un legajo queda frenado, pero tampoco puede dejar afuera a esa persona desde
 * otra máquina simplemente agotándole los intentos.
 */

const MAX_INTENTOS = Number(process.env.LOGIN_MAX_INTENTOS ?? 5);
const VENTANA_MS = Number(process.env.LOGIN_VENTANA_MINUTOS ?? 15) * 60_000;

interface Registro {
  intentos: number;
  hasta: number;
}

const registros = new Map<string, Registro>();

/** Descarta lo vencido para que el Map no crezca sin control. */
function limpiar(ahora: number) {
  if (registros.size < 500) return;
  for (const [clave, registro] of registros) {
    if (registro.hasta <= ahora) registros.delete(clave);
  }
}

export interface EstadoLimite {
  bloqueado: boolean;
  minutosRestantes: number;
}

export function verificarLimite(legajo: string, ip: string): EstadoLimite {
  const ahora = Date.now();
  const registro = registros.get(`${legajo}|${ip}`);
  if (!registro || registro.hasta <= ahora || registro.intentos < MAX_INTENTOS) {
    return { bloqueado: false, minutosRestantes: 0 };
  }
  return {
    bloqueado: true,
    minutosRestantes: Math.max(1, Math.ceil((registro.hasta - ahora) / 60_000)),
  };
}

export function registrarFallo(legajo: string, ip: string) {
  const ahora = Date.now();
  limpiar(ahora);
  const clave = `${legajo}|${ip}`;
  const registro = registros.get(clave);

  if (!registro || registro.hasta <= ahora) {
    registros.set(clave, { intentos: 1, hasta: ahora + VENTANA_MS });
    return;
  }
  registro.intentos += 1;
  // Cada fallo reinicia la ventana: probar sin parar no acorta la espera.
  registro.hasta = ahora + VENTANA_MS;
}

export function limpiarIntentos(legajo: string, ip: string) {
  registros.delete(`${legajo}|${ip}`);
}

/** Solo para las pruebas. */
export function reiniciarLimites() {
  registros.clear();
}
