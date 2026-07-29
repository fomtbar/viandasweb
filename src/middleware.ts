import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, leerSesionDeToken } from "@/lib/auth/sesion";

/**
 * Filtro de borde. Corre en el runtime Edge, asi que SOLO hace verificacion
 * criptografica del JWT y ruteo: no puede tocar Prisma ni bcrypt.
 *
 * DELIBERADAMENTE NO DECIDE NADA QUE DEPENDA DEL ESTADO DEL USUARIO
 * (si debe cambiar la clave, si es admin, si sigue activo). Todo eso vive en
 * src/lib/auth/guards.ts, que lee la base.
 *
 * El motivo es concreto: el payload del JWT dura 8 horas y envejece. Si el
 * middleware decidiera con la cookie y el guard con la base, en cuanto ambos
 * discrepan se produce un BUCLE INFINITO de redirecciones. Ejemplo real: un
 * admin resetea la clave de alguien que esta logueado; la cookie dice
 * "no debe cambiar" y la base dice "debe cambiar", el guard manda a
 * /cambiar-password y el middleware lo devuelve a /, sin fin.
 *
 * Una sola fuente de verdad: la base.
 */
export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Expulsion decidida por un guard (baja, cambio de rol, reset de clave).
  // El guard no puede borrar la cookie porque corre en un Server Component,
  // asi que la borra el middleware aca. Sin esto habria bucle: el JWT sigue
  // siendo criptograficamente valido y mas abajo /login rebota a /.
  if (pathname === "/login" && searchParams.has("motivo")) {
    const respuesta = NextResponse.next();
    respuesta.cookies.delete(COOKIE_SESION);
    return respuesta;
  }

  const sesion = await leerSesionDeToken(req.cookies.get(COOKIE_SESION)?.value);

  if (!sesion) {
    if (pathname === "/login") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Los archivos estaticos se excluyen POR EXTENSION y no por nombre: cuando
  // solo estaba listado favicon.ico, agregar el logo y los iconos de la app
  // (public/logo.png, src/app/icon.png, apple-icon.png) los dejo sin sesion
  // detras del guard, que los redirigia a /login. El navegador recibia un 307
  // en vez del PNG y mostraba la imagen rota.
  matcher: [
    "/((?!_next/static|_next/image|api/health|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|webmanifest)$).*)",
  ],
};
