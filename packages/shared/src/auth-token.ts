/**
 * Token efímero para autenticar la identidad de cuenta ante el worker realtime.
 * La web lo firma (HMAC-SHA256, mismo secreto JWT_SECRET en ambos workers) y el
 * cliente lo presenta al encolarse / entrar a la sala. Sin token válido, la
 * batalla se juega como invitado y no mueve ELO.
 */

export const DEV_JWT_SECRET = "rapear-online-dev-secret-change-in-prod";

async function hmacKey(secret: string): Promise<CryptoKey> {
	const enc = new TextEncoder();
	return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
		"verify",
	]);
}

export interface RealtimeTokenPayload {
	sub: string;
	exp: number;
}

export async function signRealtimeToken(userId: string, secret: string, ttlSeconds = 600): Promise<string> {
	const key = await hmacKey(secret);
	const payload = JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds } satisfies RealtimeTokenPayload);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
	return `${btoa(payload)}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

/** Devuelve el userId si el token es válido y no expiró; si no, null. */
export async function verifyRealtimeToken(token: string, secret: string): Promise<string | null> {
	const dot = token.indexOf(".");
	if (dot === -1) return null;
	try {
		const rawPayload = atob(token.slice(0, dot));
		const sig = Uint8Array.from(atob(token.slice(dot + 1)), (c) => c.charCodeAt(0));
		const key = await hmacKey(secret);
		const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(rawPayload));
		if (!valid) return null;
		const payload = JSON.parse(rawPayload) as RealtimeTokenPayload;
		if (!payload.sub || typeof payload.exp !== "number") return null;
		if (payload.exp < Math.floor(Date.now() / 1000)) return null;
		return payload.sub;
	} catch {
		return null;
	}
}
