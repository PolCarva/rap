const DEV_SECRET = "rapear-online-dev-secret-change-in-prod";
const COOKIE_NAME = "ra_session";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

function getSecret(): string {
	return process.env.JWT_SECRET ?? DEV_SECRET;
}

async function getKey(secret: string): Promise<CryptoKey> {
	const enc = new TextEncoder();
	return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hashPassword(password: string): Promise<string> {
	const enc = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
		keyMaterial,
		256,
	);
	const saltHex = Array.from(salt, (b) => b.toString(16).padStart(2, "0")).join("");
	const hashHex = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
	return `pbkdf2:${saltHex}:${hashHex}`;
}

export async function verifyPassword(stored: string, candidate: string): Promise<boolean> {
	const parts = stored.split(":");
	if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;
	const saltHex = parts[1];
	const expectedHex = parts[2];
	const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(candidate), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
		keyMaterial,
		256,
	);
	const candidateHex = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
	return candidateHex === expectedHex;
}

export async function createSessionToken(userId: string): Promise<string> {
	const key = await getKey(getSecret());
	const payload = JSON.stringify({ sub: userId, iat: Math.floor(Date.now() / 1000) });
	const enc = new TextEncoder();
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
	const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
	const payloadB64 = btoa(payload);
	return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(token: string): Promise<string | null> {
	const dot = token.indexOf(".");
	if (dot === -1) return null;
	const payloadB64 = token.slice(0, dot);
	const sigB64 = token.slice(dot + 1);
	try {
		const key = await getKey(getSecret());
		const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
		const enc = new TextEncoder();
		const rawPayload = atob(payloadB64);
		const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(rawPayload));
		if (!valid) return null;
		const payload = JSON.parse(rawPayload) as { sub: string; iat: number };
		return payload.sub;
	} catch {
		return null;
	}
}

export function sessionCookieOptions(token: string) {
	return {
		name: COOKIE_NAME,
		value: token,
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax" as const,
		path: "/",
		maxAge: TOKEN_MAX_AGE,
	};
}

export function clearCookieOptions() {
	return {
		name: COOKIE_NAME,
		value: "",
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax" as const,
		path: "/",
		maxAge: 0,
	};
}

export { COOKIE_NAME };
