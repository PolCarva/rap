import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { getUserById } from "@rap/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";

type EnvWithDb = CloudflareEnv & { DB?: D1Database };

export async function GET(): Promise<Response> {
	const jar = await cookies();
	const token = jar.get(COOKIE_NAME)?.value;
	if (!token) return Response.json({ user: null });

	const userId = await verifySessionToken(token);
	if (!userId) return Response.json({ user: null });

	let db: D1Database | null = null;
	try {
		const { env } = getCloudflareContext();
		db = (env as EnvWithDb).DB ?? null;
	} catch {
		// OpenNext context is unavailable during some local Next.js executions.
	}

	if (!db) return Response.json({ user: null });

	const user = await getUserById(db, userId);
	if (!user) return Response.json({ user: null });

	return Response.json({
		user: {
			id: user.id,
			handle: user.handle,
			email: user.email,
			elo: user.elo,
			battles: user.battles,
			wins: user.wins,
			draws: user.draws,
			losses: user.losses,
			currentStreak: user.currentStreak,
			bestStreak: user.bestStreak,
		},
	});
}
