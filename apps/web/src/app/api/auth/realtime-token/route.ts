import { getCurrentUser } from "@/lib/server-auth";
import { DEV_JWT_SECRET, signRealtimeToken } from "@rap/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type EnvWithSecret = CloudflareEnv & { JWT_SECRET?: string };

function jwtSecret(): string {
	try {
		const { env } = getCloudflareContext();
		return (env as EnvWithSecret).JWT_SECRET ?? process.env.JWT_SECRET ?? DEV_JWT_SECRET;
	} catch {
		return process.env.JWT_SECRET ?? DEV_JWT_SECRET;
	}
}

/**
 * Token efímero (10 min) que respalda el userId ante el worker realtime.
 * Solo se emite con sesión de cuenta activa (cookie httpOnly válida).
 */
export async function GET(): Promise<Response> {
	const user = await getCurrentUser();
	if (!user || user.isGuest) return Response.json({ token: null }, { status: 401 });
	const token = await signRealtimeToken(user.id, jwtSecret());
	return Response.json({ token });
}
