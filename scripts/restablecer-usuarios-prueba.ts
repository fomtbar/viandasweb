/**
 * Deja a los usuarios usados en pruebas manuales como recien importados:
 * contrasena = legajo y cambio forzado pendiente.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/restablecer-usuarios-prueba.ts 5169 132
 */
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

async function main() {
  const legajos = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
  if (legajos.length === 0) {
    console.log("Uso: ... restablecer-usuarios-prueba.ts <legajo> [legajo...]");
    return;
  }

  for (const legajo of legajos) {
    await prisma.usuario.update({
      where: { legajo },
      data: {
        passwordHash: await hashPassword(String(legajo)),
        debeCambiarPassword: true,
        passwordActualizadoAt: null,
      },
    });
    console.log(`  legajo ${legajo}: contraseña = legajo, cambio pendiente`);
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
