"use client";

import { Entrada } from "@/components/ui";
import { formatearHoraParcial } from "@/lib/tiempo";

/**
 * Campo de hora con el ':' automatico, equivalente a bind_hora_entry de la
 * app Tkinter. Escribir "1130" produce "11:30".
 *
 * A diferencia de la version Tkinter, borrar funciona solo: no hay que
 * interceptar Backspace porque el formateo se recalcula sobre los digitos.
 */
export function HoraInput({
  id,
  name,
  valor,
  onChange,
  disabled,
  invalido,
}: {
  id?: string;
  name?: string;
  valor: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
  invalido?: boolean;
}) {
  return (
    <Entrada
      id={id}
      name={name}
      value={valor}
      onChange={(e) => onChange(formatearHoraParcial(e.target.value))}
      disabled={disabled}
      inputMode="numeric"
      maxLength={5}
      placeholder="HH:MM"
      aria-invalid={invalido || undefined}
      className={`tabular ${invalido ? "border-error" : ""}`}
    />
  );
}
