/** URL base del Worker de tiempo real. Override con NEXT_PUBLIC_REALTIME_URL. */
export const REALTIME_WS_URL =
	process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://127.0.0.1:8787";

export const matchmakingUrl = () => `${REALTIME_WS_URL}/ws/matchmaking`;
export const battleUrl = (battleId: string) => `${REALTIME_WS_URL}/ws/battle/${battleId}`;
export const transcribeUrl = () => `${REALTIME_WS_URL}/ws/transcribe`;
