import type { ComponentProps, ReactNode } from "react";

/** Primitivas visuales. Sin logica de negocio: solo estilos consistentes. */

const clases = (...partes: (string | false | null | undefined)[]) =>
  partes.filter(Boolean).join(" ");

// ── Boton ────────────────────────────────────────────────────

type VarianteBoton = "primario" | "secundario" | "peligro" | "fantasma";

const ESTILOS_BOTON: Record<VarianteBoton, string> = {
  primario:
    "bg-acento text-white hover:bg-acento-fuerte disabled:bg-tinta-tenue",
  secundario:
    "bg-panel text-tinta border border-linea-fuerte hover:bg-lienzo disabled:text-tinta-tenue",
  peligro:
    "bg-error text-white hover:brightness-90 disabled:bg-tinta-tenue",
  fantasma:
    "bg-transparent text-acento hover:bg-acento-tenue disabled:text-tinta-tenue",
};

export function Boton({
  variante = "primario",
  className,
  ...props
}: ComponentProps<"button"> & { variante?: VarianteBoton }) {
  return (
    <button
      {...props}
      className={clases(
        "inline-flex items-center justify-center gap-2 rounded px-3 py-2",
        "text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed",
        ESTILOS_BOTON[variante],
        className,
      )}
    />
  );
}

// ── Campos ───────────────────────────────────────────────────

export function Etiqueta({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      {...props}
      className={clases(
        "block text-xs font-semibold uppercase tracking-wide text-tinta-suave",
        className,
      )}
    />
  );
}

export function Entrada({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={clases(
        "w-full rounded border border-linea-fuerte bg-panel px-3 py-2 text-sm",
        "placeholder:text-tinta-tenue",
        "disabled:bg-lienzo disabled:text-tinta-suave",
        className,
      )}
    />
  );
}

export function Seleccion({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={clases(
        "w-full rounded border border-linea-fuerte bg-panel px-3 py-2 text-sm",
        "disabled:bg-lienzo disabled:text-tinta-suave",
        className,
      )}
    />
  );
}

export function AreaTexto({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={clases(
        "w-full rounded border border-linea-fuerte bg-panel px-3 py-2 text-sm",
        "disabled:bg-lienzo disabled:text-tinta-suave",
        className,
      )}
    />
  );
}

export function CampoConEtiqueta({
  etiqueta,
  ayuda,
  htmlFor,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Etiqueta htmlFor={htmlFor}>{etiqueta}</Etiqueta>
      {children}
      {ayuda && <p className="text-xs text-tinta-suave">{ayuda}</p>}
    </div>
  );
}

// ── Avisos ───────────────────────────────────────────────────

type TonoAlerta = "error" | "aviso" | "exito" | "info";

const ESTILOS_ALERTA: Record<TonoAlerta, string> = {
  error: "border-error/30 bg-error-tenue text-error",
  aviso: "border-aviso/30 bg-aviso-tenue text-aviso",
  exito: "border-exito/30 bg-exito-tenue text-exito",
  info: "border-acento/30 bg-acento-tenue text-acento-fuerte",
};

export function Alerta({
  tono = "info",
  titulo,
  children,
  className,
}: {
  tono?: TonoAlerta;
  titulo?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      // Next inyecta su propio role="alert" (el anunciador de rutas), asi que
      // las pruebas necesitan un ancla propia.
      data-testid="alerta"
      data-tono={tono}
      className={clases(
        "rounded border px-3 py-2 text-sm",
        ESTILOS_ALERTA[tono],
        className,
      )}
    >
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children}
    </div>
  );
}

/**
 * Lista de errores de validacion. Reproduce el messagebox unico de la app
 * Tkinter: todos los problemas juntos, no de a uno.
 */
export function ListaErrores({ errores }: { errores: string[] }) {
  if (errores.length === 0) return null;
  return (
    <Alerta tono="error" titulo={errores.length > 1 ? "Datos incompletos" : undefined}>
      <ul className={clases(errores.length > 1 && "mt-1 list-disc space-y-0.5 pl-5")}>
        {errores.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </Alerta>
  );
}

// ── Contenedores ─────────────────────────────────────────────

export function Panel({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      {...props}
      className={clases(
        "rounded-lg border border-linea bg-panel shadow-sm",
        className,
      )}
    />
  );
}
