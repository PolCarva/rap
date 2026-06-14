import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Canonicalización de host con 301 permanente.
 *
 * Consolida el tráfico de `www.rapear.online` hacia el dominio sin `www`
 * (`rapear.online`), que es el host canónico declarado en SITE_URL/SEO.
 * Preserva path, query y método; el resto de hosts pasan sin tocar.
 */
const CANONICAL_HOST = "rapear.online";
const WWW_HOST = "www.rapear.online";

export function middleware(req: NextRequest) {
	const host = req.headers.get("host")?.toLowerCase();

	if (host === WWW_HOST) {
		const url = req.nextUrl.clone();
		url.protocol = "https:";
		url.host = CANONICAL_HOST;
		url.port = "";
		// 301 Moved Permanently (no 308) para la consolidación SEO pedida.
		return NextResponse.redirect(url, 301);
	}

	return NextResponse.next();
}

export const config = {
	// Aplica a todas las rutas; el redirect solo dispara en el host www,
	// así que en el host canónico es un passthrough sin costo.
	matcher: "/:path*",
};
