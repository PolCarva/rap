const LOCAL_WS = "ws://127.0.0.1:8787";

/** Infer rap-realtime URL from rap web hostname on *.workers.dev */
export function inferWsFromHostname(hostname: string): string | null {
	if (hostname === "localhost" || hostname === "127.0.0.1") return null;
	if (hostname.startsWith("rap.") && hostname.endsWith(".workers.dev")) {
		return `wss://rap-realtime.${hostname.slice("rap.".length)}`;
	}
	return null;
}

function wsToHttp(ws: string): string {
	return ws.replace(/^ws(s?):/, "http$1:");
}

function envWsUrl(): string | null {
	return process.env.NEXT_PUBLIC_REALTIME_URL ?? process.env.REALTIME_WS_URL ?? null;
}

/** URL base del Worker de tiempo real (resuelta en runtime). */
export function getRealtimeWsUrl(): string {
	const fromEnv = envWsUrl();
	if (fromEnv) return fromEnv;

	if (typeof window !== "undefined") {
		const inferred = inferWsFromHostname(window.location.hostname);
		if (inferred) return inferred;
	}

	return LOCAL_WS;
}

export function getRealtimeHttpUrl(): string {
	return wsToHttp(getRealtimeWsUrl());
}

export const matchmakingUrl = () => `${getRealtimeWsUrl()}/ws/matchmaking`;
export const battleUrl = (battleId: string) => `${getRealtimeWsUrl()}/ws/battle/${battleId}`;
export const transcribeUrl = () => `${getRealtimeWsUrl()}/ws/transcribe`;
