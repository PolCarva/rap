import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { getUserById, type UserAuthRow } from "@rap/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";

type EnvWithDb = CloudflareEnv & { DB?: D1Database };

export function getServerDb(): D1Database | null {
	try {
		const { env } = getCloudflareContext();
		return (env as EnvWithDb).DB ?? null;
	} catch {
		return null;
	}
}

export async function getCurrentUser(): Promise<UserAuthRow | null> {
	const jar = await cookies();
	const token = jar.get(COOKIE_NAME)?.value;
	if (!token) return null;

	const userId = await verifySessionToken(token);
	if (!userId) return null;

	const db = getServerDb();
	if (!db) return null;
	return getUserById(db, userId);
}
