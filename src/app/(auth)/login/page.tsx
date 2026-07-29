import { Alerta } from "@/components/ui";
import { FormularioLogin } from "./FormularioLogin";

export const dynamic = "force-dynamic";

const MOTIVOS: Record<string, string> = {
  "password-cambiada":
    "Su contraseña cambió. Vuelva a ingresar con la nueva.",
  "sin-acceso": "Su sesión terminó. Vuelva a ingresar.",
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string; next?: string }>;
}) {
  const { motivo, next } = await searchParams;
  const aviso = motivo ? MOTIVOS[motivo] : undefined;

  return (
    <div className="space-y-4">
      {aviso && <Alerta tono="info">{aviso}</Alerta>}
      <FormularioLogin destino={next} />
    </div>
  );
}
