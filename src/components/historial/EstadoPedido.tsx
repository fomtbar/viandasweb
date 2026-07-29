const ESTILOS: Record<string, string> = {
  enviado: "bg-exito-tenue text-exito",
  borrador: "bg-aviso-tenue text-aviso",
  cancelado: "bg-linea text-tinta-suave",
};

const ETIQUETAS: Record<string, string> = {
  enviado: "Enviado",
  // Se guardo pero el correo nunca llego a abrirse.
  borrador: "Sin enviar",
  cancelado: "Cancelado",
};

export function EstadoPedido({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        ESTILOS[estado] ?? "bg-linea text-tinta-suave"
      }`}
    >
      {ETIQUETAS[estado] ?? estado}
    </span>
  );
}
