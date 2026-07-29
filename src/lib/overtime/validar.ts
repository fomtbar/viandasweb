import { minutoEnRango, type RangoMinutos } from "./parse";
import { minutosAHhmm } from "@/lib/tiempo";

/**
 * Valida que la hora de retiro caiga en alguna ventana de overtime.
 *
 * La tabla `overtime_ventanas` existe desde la app Tkinter con las 3 ventanas
 * reales de la planta, pero NINGUNA pantalla la usaba: se importaba del Excel
 * y quedaba muerta. Esto es la regla de negocio implementada de verdad.
 *
 * OJO: dos de las tres ventanas cruzan medianoche ("23:13 A 2:34" y
 * "5:54 A 8:54"), asi que la comparacion no puede ser un simple
 * desde <= x <= hasta. De eso se ocupa minutoEnRango().
 */

export interface VentanaValidable {
  orden: number;
  /** Rangos de OT previo y posterior ya parseados; los ilegibles se descartan. */
  rangos: RangoMinutos[];
}

export interface ResultadoValidacion {
  enVentana: boolean;
  /** Orden de la ventana que acepto el horario, si hubo alguna. */
  ventana: number | null;
  mensaje: string | null;
}

export function validarRetiro(
  minuto: number,
  ventanas: VentanaValidable[],
): ResultadoValidacion {
  // Sin ventanas cargadas no hay nada contra que validar: no se molesta al GL.
  if (ventanas.length === 0) {
    return { enVentana: true, ventana: null, mensaje: null };
  }

  for (const v of ventanas) {
    if (v.rangos.some((r) => minutoEnRango(minuto, r))) {
      return { enVentana: true, ventana: v.orden, mensaje: null };
    }
  }

  return {
    enVentana: false,
    ventana: null,
    mensaje: `El horario de retiro ${minutosAHhmm(minuto)} no cae dentro de ninguna ventana de overtime.`,
  };
}

/** Descripcion legible de las ventanas, para mostrar junto al aviso. */
export function describirVentanas(ventanas: VentanaValidable[]): string[] {
  return ventanas.flatMap((v) =>
    v.rangos.map((r) => `${minutosAHhmm(r.desdeMin)} a ${minutosAHhmm(r.hastaMin)}`),
  );
}
