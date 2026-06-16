import { getCloudflareContext } from "@opennextjs/cloudflare";

type EnvWithTurn = CloudflareEnv & {
	TURN_KEY_ID?: string;
	TURN_KEY_API_TOKEN?: string;
};

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
	{ urls: "stun:stun.cloudflare.com:3478" },
	{ urls: "stun:stun.l.google.com:19302" },
];

function turnEnv(): { keyId: string | null; apiToken: string | null } {
	try {
		const { env } = getCloudflareContext();
		const cfEnv = env as EnvWithTurn;
		return {
			keyId: cfEnv.TURN_KEY_ID ?? process.env.TURN_KEY_ID ?? null,
			apiToken: cfEnv.TURN_KEY_API_TOKEN ?? process.env.TURN_KEY_API_TOKEN ?? null,
		};
	} catch {
		return {
			keyId: process.env.TURN_KEY_ID ?? null,
			apiToken: process.env.TURN_KEY_API_TOKEN ?? null,
		};
	}
}

function validIceServers(value: unknown): value is RTCIceServer[] {
	if (!Array.isArray(value)) return false;
	return value.every((server) => {
		if (!server || typeof server !== "object") return false;
		const urls = (server as RTCIceServer).urls;
		return typeof urls === "string" || (Array.isArray(urls) && urls.every((url) => typeof url === "string"));
	});
}

export async function GET(): Promise<Response> {
	const { keyId, apiToken } = turnEnv();
	if (!keyId || !apiToken) {
		return Response.json({ iceServers: FALLBACK_ICE_SERVERS, source: "fallback" });
	}

	try {
		const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ ttl: 86400 }),
		});
		if (!res.ok) throw new Error(`Cloudflare TURN credentials failed: ${res.status}`);

		const data = (await res.json()) as { iceServers?: unknown };
		if (!validIceServers(data.iceServers)) throw new Error("Cloudflare TURN response did not include iceServers");

		return Response.json({ iceServers: data.iceServers, source: "cloudflare" });
	} catch (error) {
		console.warn("TURN credentials unavailable, falling back to STUN", error);
		return Response.json({ iceServers: FALLBACK_ICE_SERVERS, source: "fallback" });
	}
}
