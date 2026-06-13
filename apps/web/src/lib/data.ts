import {
	getProfile,
	listBattles,
	listBeats,
	listRanking,
	listUserBattles,
	getModalityStats,
	upsertUser,
	upsertBeat,
	deleteBeat,
	type BattleSummaryRow,
	type BeatInput,
	type ModalityStatRow,
	type ProfileRow,
	type RankingRow,
} from "@rap/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { getRealtimeHttpUrl, inferWsFromHostname } from "@/lib/realtime";

type EnvWithDb = CloudflareEnv & { DB?: D1Database; REALTIME_WS_URL?: string };

function getDb(): D1Database | null {
	try {
		const { env } = getCloudflareContext();
		return (env as EnvWithDb).DB ?? null;
	} catch {
		return null;
	}
}

async function serverRealtimeHttpUrl(): Promise<string> {
	try {
		const { env } = getCloudflareContext();
		const ws = (env as EnvWithDb).REALTIME_WS_URL;
		if (ws) return ws.replace(/^ws(s?):/, "http$1:");
	} catch {
		// next dev sin bindings
	}

	try {
		const host = (await headers()).get("host")?.split(":")[0];
		if (host) {
			const inferred = inferWsFromHostname(host);
			if (inferred) return inferred.replace(/^ws(s?):/, "http$1:");
		}
	} catch {
		// fuera de request context
	}

	return getRealtimeHttpUrl();
}

async function realtimeJson<T>(path: string): Promise<T | null> {
	try {
		const base = await serverRealtimeHttpUrl();
		const res = await fetch(`${base}${path}`, { cache: "no-store" });
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

export function parseBattleWords(row: BattleSummaryRow): string[] {
	try {
		const parsed = JSON.parse(row.words) as unknown;
		return Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === "string") : [];
	} catch {
		return [];
	}
}

export async function getRanking(limit = 20) {
	const db = getDb();
	const realtime = async () =>
		(await realtimeJson<{ ranking: RankingRow[] }>(`/ranking?limit=${limit}`))?.ranking ?? [];
	const realtimeRanking = await realtime();
	if (realtimeRanking.length > 0) return realtimeRanking;
	if (!db) return [];
	try {
		return await listRanking(db, limit);
	} catch {
		return [];
	}
}

export async function getBeats(includeInactive = false) {
	const db = getDb();
	if (!db) return [];
	try {
		return await listBeats(db, includeInactive);
	} catch {
		return [];
	}
}

export async function saveBeat(input: BeatInput) {
	const db = getDb();
	if (!db) throw new Error("Base de datos no disponible");
	return upsertBeat(db, input);
}

export async function removeBeat(id: string) {
	const db = getDb();
	if (!db) throw new Error("Base de datos no disponible");
	await deleteBeat(db, id);
}

export async function getRecentBattles(limit = 20) {
	const db = getDb();
	const realtime = async () =>
		(await realtimeJson<{ battles: BattleSummaryRow[] }>(`/battles?limit=${limit}`))?.battles ?? [];
	const realtimeBattles = await realtime();
	if (realtimeBattles.length > 0) return realtimeBattles;
	if (!db) return [];
	try {
		return await listBattles(db, limit);
	} catch {
		return [];
	}
}

export async function getPublicProfile(id: string) {
	const db = getDb();
	const realtime = async () =>
		(await realtimeJson<{ profile: ProfileRow | null }>(`/profile?id=${encodeURIComponent(id)}`))?.profile ?? null;
	const realtimeProfile = await realtime();
	if (!db) return realtimeProfile;
	try {
		const localProfile = await getProfile(db, id);
		if (!realtimeProfile) return localProfile;
		return {
			...realtimeProfile,
			handle: localProfile?.handle ?? realtimeProfile.handle,
			email: localProfile?.email ?? realtimeProfile.email,
			avatarUrl: localProfile?.avatarUrl ?? realtimeProfile.avatarUrl,
			avatarConfig: localProfile?.avatarConfig ?? realtimeProfile.avatarConfig,
		};
	} catch {
		return realtimeProfile;
	}
}

export async function getUserBattles(userId: string, limit = 30): Promise<BattleSummaryRow[]> {
	const db = getDb();
	const realtime = async () =>
		(await realtimeJson<{ battles: BattleSummaryRow[] }>(
			`/profile?id=${encodeURIComponent(userId)}&limit=${limit}`,
		))?.battles ?? [];
	const realtimeBattles = await realtime();
	if (realtimeBattles.length > 0) return realtimeBattles;
	if (!db) return [];
	try {
		return await listUserBattles(db, userId, limit);
	} catch {
		return [];
	}
}

export async function getUserModalityStats(userId: string): Promise<ModalityStatRow[]> {
	const db = getDb();
	const realtime = async () =>
		(await realtimeJson<{ modalityStats: ModalityStatRow[] }>(
			`/profile?id=${encodeURIComponent(userId)}`,
		))?.modalityStats ?? [];
	const realtimeStats = await realtime();
	if (realtimeStats.length > 0) return realtimeStats;
	if (!db) return [];
	try {
		return await getModalityStats(db, userId);
	} catch {
		return [];
	}
}

export async function persistSession(input: {
	sessionId: string;
	userId: string | null;
	name: string;
	isGuest: boolean;
}) {
	const db = getDb();
	if (!db) return { id: input.userId ?? `guest:${input.sessionId}`, handle: input.name, persisted: false };
	try {
		const id = await upsertUser(db, input);
		const profile = await getProfile(db, id);
		return { id, handle: profile?.handle ?? input.name, persisted: true };
	} catch {
		return { id: input.userId ?? `guest:${input.sessionId}`, handle: input.name, persisted: false };
	}
}
