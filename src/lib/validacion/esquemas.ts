import { z } from "zod";

/** Esquemas compartidos entre el cliente (feedback inmediato) y el servidor. */

export const EsquemaLogin = z.object({
  legajo: z
    .string()
    .trim()
    .min(1, "Ingrese su legajo.")
    .regex(/^\d+$/, "El legajo son solo números.")
    .transform(Number)
    .refine((n) => n > 0, "Legajo inválido."),
  password: z.string().min(1, "Ingrese su contraseña."),
});

export const LARGO_MINIMO_PASSWORD = 8;

export const EsquemaCambioPassword = z
  .object({
    actual: z.string().min(1, "Ingrese su contraseña actual."),
    nueva: z
      .string()
      .min(
        LARGO_MINIMO_PASSWORD,
        `La nueva contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`,
      ),
    confirmacion: z.string().min(1, "Repita la nueva contraseña."),
  })
  .refine((d) => d.nueva === d.confirmacion, {
    path: ["confirmacion"],
    message: "Las contraseñas no coinciden.",
  })
  .refine((d) => d.nueva !== d.actual, {
    path: ["nueva"],
    message: "La nueva contraseña debe ser distinta de la actual.",
  });

/** Devuelve los mensajes de error de un parseo fallido, sin duplicados. */
export function mensajesDeError(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((i) => i.message))];
}
