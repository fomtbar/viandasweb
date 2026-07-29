import { exigirEntornoDestruible, destinoActual } from "../src/lib/entorno";

/**
 * globalSetup de Playwright: corta la corrida entera antes del primer test si
 * el entorno no esta declarado como descartable.
 *
 * Las pruebas e2e no son de solo lectura. Entre otras cosas resetean las
 * contrasenas de los legajos 5169 y 132, borran preferencias y crean y
 * eliminan pedidos. Contra la base de la compania eso deja a dos personas sin
 * poder entrar y pierde configuracion real.
 */
export default function guardia() {
  exigirEntornoDestruible("correr las pruebas e2e");
  console.log(`\n  e2e contra ${destinoActual()}\n`);
}
