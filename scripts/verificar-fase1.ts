/**
 * Chequeos de la fase 1 sobre la base ya importada.
 * Cada asercion apunta a una trampa concreta del port, no a "que haya datos".
 *
 *   npx tsx --env-file=.env scripts/verificar-fase1.ts
 */
import { prisma } from "@/lib/prisma";
import { formatearFechaDdMmYyyy, minutosAHhmm } from "@/lib/tiempo";

let fallos = 0;

function chequear(descripcion: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(
    `  ${ok ? "ok  " : "FALLA"}  ${descripcion}\n         esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(real)}`,
  );
}

async function main() {
  console.log("\n=== Verificacion fase 1 ===\n");

  // Conteos
  chequear("sectores", await prisma.sector.count(), 66);
  chequear("cargos", await prisma.cargo.count(), 14);
  chequear("turnos", await prisma.turno.count(), 16);
  chequear("empleados", await prisma.empleado.count(), 806);
  chequear("usuarios", await prisma.usuario.count(), 806);
  chequear("motivos", await prisma.motivo.count(), 19);
  chequear("pedidos", await prisma.pedido.count(), 14);
  chequear("pedido_items", await prisma.pedidoItem.count(), 44);
  chequear("usuarios GL", await prisma.usuario.count({ where: { esGl: true } }), 146);
  chequear("usuarios admin", await prisma.usuario.count({ where: { esAdmin: true } }), 3);

  // La fecha NO se corrio un dia (riesgo R11: @db.Date + TZ Argentina).
  const pedido1 = await prisma.pedido.findFirst({ orderBy: { id: "asc" } });
  chequear(
    "pedido #1: fecha 18/05/2026 y no 17/05",
    pedido1 ? formatearFechaDdMmYyyy(pedido1.fechaSolicitud) : null,
    "18/05/2026",
  );
  chequear("pedido #1: retiro 11:00 = 660 min", pedido1?.retiroDesdeMin, 660);
  chequear(
    "pedido #1: retiro formateado",
    pedido1 ? minutosAHhmm(pedido1.retiroDesdeMin) : null,
    "11:00",
  );
  chequear("pedido #1: estado historico 'enviado'", pedido1?.estado, "enviado");

  // Passwords re-hasheadas y con cambio forzado.
  const usuario = await prisma.usuario.findFirst({ orderBy: { legajo: "asc" } });
  chequear(
    "password re-hasheada con bcrypt",
    usuario?.passwordHash.slice(0, 7),
    "$2b$10$",
  );
  chequear("cambio de clave forzado", usuario?.debeCambiarPassword, true);
  chequear(
    "ningun usuario quedo sin forzar el cambio",
    await prisma.usuario.count({ where: { debeCambiarPassword: false } }),
    0,
  );

  // La ventana OT que cruza medianoche: "23:13 A 2:34".
  const ventana2 = await prisma.overtimeVentana.findFirst({ where: { orden: 2 } });
  chequear("ventana 2: ot_posterior texto", ventana2?.otPosterior, "23:13 A 2:34");
  chequear("ventana 2: desde = 1393 min (23:13)", ventana2?.otPosteriorDesdeMin, 1393);
  chequear("ventana 2: hasta = 154 min (2:34)", ventana2?.otPosteriorHastaMin, 154);
  chequear(
    "ventana 3: ot_posterior 5:54 -> 354",
    (await prisma.overtimeVentana.findFirst({ where: { orden: 3 } }))?.otPosteriorDesdeMin,
    354,
  );

  // Acentos: la collation es CI_AI y el texto viajo como NVarChar.
  const conTilde = await prisma.empleado.findFirst({
    where: { apellidoNombre: { contains: "Adrián" } },
  });
  chequear("acentos preservados (busca 'Adrián')", conTilde !== null, true);
  chequear(
    "collation acento-insensible (busca 'Adrian' sin tilde)",
    (await prisma.empleado.count({ where: { apellidoNombre: { contains: "Adrian" } } })) > 0,
    true,
  );

  // El empleado con catalogo incompleto sobrevivio (FKs opcionales).
  chequear(
    "empleados sin sector",
    await prisma.empleado.count({ where: { sectorId: null } }),
    1,
  );

  // Preferencias: claves migradas y nuevas.
  const prefs = new Map(
    (await prisma.preferencia.findMany()).map((p) => [p.clave, p.valor]),
  );
  chequear("preferencias totales", prefs.size, 10);
  chequear("mail_method renombrada a mail_metodo_default", prefs.get("mail_metodo_default"), "mailto");
  chequear("login_windows_auto descartada", prefs.has("login_windows_auto"), false);
  chequear("mail_to conservada", prefs.get("mail_to"), "overtimesolicitud@gmail.com");
  chequear("empresa_nombre conservada", prefs.get("empresa_nombre"), "TBAR");
  chequear("ot_validacion_modo nueva", prefs.get("ot_validacion_modo"), "advertir");
  chequear(
    "plantilla del cuerpo con sus placeholders",
    prefs.get("mail_body_template")?.includes("{lista_personas}"),
    true,
  );

  // El SUPERVIS tenia la descripcion editada a mano en la app vieja.
  chequear(
    "cargo SUPERVIS conserva descripcion editada",
    (await prisma.cargo.findFirst({ where: { codigo: "SUPERVIS" } }))?.descripcion,
    "Group",
  );

  console.log(
    fallos === 0
      ? "\nTodo OK.\n"
      : `\n${fallos} chequeo(s) fallaron.\n`,
  );
  if (fallos > 0) process.exitCode = 1;
}

main().finally(async () => {
  await prisma.$disconnect();
});
