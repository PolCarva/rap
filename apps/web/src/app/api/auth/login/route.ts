import { verifyPassword, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { getUserByEmail } from "@rap/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { z } from "zod";

type EnvWithDb = CloudflareEnv & { DB?: D1Database };

const bodySchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "Email y contraseña requeridos" }, { status: 400 });
	}

	let db: D1Database | null = null;
	try {
		const { env } = getCloudflareContext();
		db = (env as EnvWithDb).DB ?? null;
	} catch {
		// OpenNext context is unavailable during some local Next.js executions.
	}

	if (!db) {
		return Response.json({ error: "Base de datos no disponible" }, { status: 503 });
	}

	const { email, password } = parsed.data;
	const user = await getUserByEmail(db, email);

	if (!user || !user.passwordHash) {
		return Response.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
	}

	const valid = await verifyPassword(user.passwordHash, password);
	if (!valid) {
		return Response.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
	}

	const token = await createSessionToken(user.id);
	const jar = await cookies();
	jar.set(sessionCookieOptions(token));

	return Response.json({ id: user.id, handle: user.handle, email: user.email });
}
