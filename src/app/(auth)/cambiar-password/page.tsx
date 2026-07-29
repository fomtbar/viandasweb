import { redirect } from "next/navigation";
import { requireSesion } from "@/lib/auth/guards";
import { obtenerUsuarioPorId, tieneAcceso } from "@/server/usuarios";
import { Alerta } from "@/components/ui";
import { FormularioCambio } from "./FormularioCambio";

export const dynamic = "force-dynamic";

/**
 * Unica pantalla protegida que usa requireSesion y no requireUsuarioFresco:
 * es justamente el destino al que ese guard manda a quien tiene el cambio
 * pendiente, asi que usarlo aca seria un bucle.
 *
 * Quien manda es la base, no el payload de la cookie (ver src/middleware.ts).
 */
export default async function PaginaCambiarPassword({
  searchParams,
}: {
  searchParams: Promise<{ voluntario?: string }>;
}) {
  const sesion = await requireSesion();
  const { voluntario } = await searchParams;

  const usuario = await obtenerUsuarioPorId(sesion.uid);
  if (!usuario || !tieneAcceso(usuario)) redirect("/login?motivo=sin-acceso");

  const forzado = usuario.debeCambiarPassword;

  // Si no lo necesita y no vino a proposito desde "Cambiar clave", no hay
  // nada que hacer aca.
  if (!forzado && !voluntario) redirect("/");

  return (
    <div className="space-y-4">
      {forzado && (
        <Alerta tono="aviso" titulo="Es su primer ingreso">
          Defina una contraseña nueva para continuar.
        </Alerta>
      )}
      <FormularioCambio forzado={forzado} />
    </div>
  );
}
