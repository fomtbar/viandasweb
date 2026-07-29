import { describe, it, expect } from "vitest";
import { parseRangoHorario, minutoEnRango } from "./parse";
import { validarRetiro, type VentanaValidable } from "./validar";
import { hhmmAMinutos, minutosAHhmm, duracionRango } from "@/lib/tiempo";

/**
 * Las tres ventanas reales de la planta, tal como estan en la base.
 * Dos de ellas CRUZAN MEDIANOCHE: es el caso que rompe cualquier comparacion
 * ingenua de rangos.
 */
const VENTANAS_REALES = [
  { orden: 1, previo: "3:00 A 6:00", posterior: "14:34 A 17:34" },
  { orden: 2, previo: "11:39 A 14:39", posterior: "23:13 A 2:34" },
  { orden: 3, previo: "20:39 A 23:39", posterior: "5:54 A 8:54" },
];

const ventanasValidables: VentanaValidable[] = VENTANAS_REALES.map((v) => ({
  orden: v.orden,
  rangos: [parseRangoHorario(v.previo)!, parseRangoHorario(v.posterior)!],
}));

describe("parseRangoHorario", () => {
  it("entiende el separador en mayuscula y en minuscula", () => {
    expect(parseRangoHorario("3:00 A 6:00")).toEqual({ desdeMin: 180, hastaMin: 360 });
    expect(parseRangoHorario("6:00 a 14:34")).toEqual({ desdeMin: 360, hastaMin: 874 });
  });

  it("parsea la ventana que cruza medianoche sin invertirla", () => {
    // 23:13 = 1393, 2:34 = 154. desde > hasta es correcto aca.
    expect(parseRangoHorario("23:13 A 2:34")).toEqual({ desdeMin: 1393, hastaMin: 154 });
  });

  it("devuelve null cuando el texto no se entiende", () => {
    expect(parseRangoHorario("de tres a seis")).toBeNull();
    expect(parseRangoHorario("3:00")).toBeNull();
    expect(parseRangoHorario("25:00 A 26:00")).toBeNull();
    expect(parseRangoHorario("")).toBeNull();
    expect(parseRangoHorario(null)).toBeNull();
  });
});

describe("minutoEnRango", () => {
  const normal = { desdeMin: 180, hastaMin: 360 }; // 3:00 a 6:00
  const cruzaMedianoche = { desdeMin: 1393, hastaMin: 154 }; // 23:13 a 2:34

  it("acepta los bordes de un rango normal", () => {
    expect(minutoEnRango(180, normal)).toBe(true);
    expect(minutoEnRango(360, normal)).toBe(true);
    expect(minutoEnRango(179, normal)).toBe(false);
    expect(minutoEnRango(361, normal)).toBe(false);
  });

  it("acepta ambos lados de la medianoche", () => {
    expect(minutoEnRango(1393, cruzaMedianoche)).toBe(true); // 23:13
    expect(minutoEnRango(1439, cruzaMedianoche)).toBe(true); // 23:59
    expect(minutoEnRango(0, cruzaMedianoche)).toBe(true); // 00:00
    expect(minutoEnRango(90, cruzaMedianoche)).toBe(true); // 01:30
    expect(minutoEnRango(154, cruzaMedianoche)).toBe(true); // 02:34
  });

  it("rechaza el hueco entre el fin y el comienzo", () => {
    expect(minutoEnRango(155, cruzaMedianoche)).toBe(false); // 02:35
    expect(minutoEnRango(600, cruzaMedianoche)).toBe(false); // 10:00
    expect(minutoEnRango(1392, cruzaMedianoche)).toBe(false); // 23:12
  });
});

describe("validarRetiro con las ventanas reales", () => {
  const validar = (hhmm: string) =>
    validarRetiro(hhmmAMinutos(hhmm)!, ventanasValidables);

  it("acepta un horario dentro de la primera ventana", () => {
    expect(validar("04:00").enVentana).toBe(true);
    expect(validar("03:00").enVentana).toBe(true);
  });

  it("acepta un horario de madrugada por la ventana que cruza medianoche", () => {
    // Este es EL caso que valida el algoritmo: 01:30 cae en "23:13 A 2:34".
    const resultado = validar("01:30");
    expect(resultado.enVentana).toBe(true);
    expect(resultado.ventana).toBe(2);
  });

  it("acepta 06:30 por la ventana 3 (5:54 A 8:54)", () => {
    expect(validar("06:30").enVentana).toBe(true);
  });

  it("rechaza un horario fuera de todas las ventanas", () => {
    const resultado = validar("10:00");
    expect(resultado.enVentana).toBe(false);
    expect(resultado.mensaje).toContain("10:00");
  });

  it("no molesta si no hay ventanas cargadas", () => {
    expect(validarRetiro(600, []).enVentana).toBe(true);
  });

  it("ignora las ventanas cuyo horario no se pudo parsear", () => {
    const soloIlegibles: VentanaValidable[] = [{ orden: 1, rangos: [] }];
    expect(validarRetiro(600, soloIlegibles).enVentana).toBe(false);
  });
});

describe("horas y rangos", () => {
  it("convierte ida y vuelta", () => {
    expect(hhmmAMinutos("11:00")).toBe(660);
    expect(hhmmAMinutos("1100")).toBe(660);
    expect(minutosAHhmm(660)).toBe("11:00");
    expect(minutosAHhmm(5)).toBe("00:05");
  });

  it("rechaza horas imposibles", () => {
    expect(hhmmAMinutos("24:00")).toBeNull();
    expect(hhmmAMinutos("10:75")).toBeNull();
    expect(hhmmAMinutos("99")).toBeNull();
  });

  it("mide un rango que cruza medianoche", () => {
    expect(duracionRango(660, 1080)).toBe(420); // 11:00 -> 18:00
    expect(duracionRango(1380, 120)).toBe(180); // 23:00 -> 02:00
    expect(duracionRango(660, 660)).toBe(0);
  });
});
