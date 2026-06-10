import { hashPassword, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { registerUser } from "@rap/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { z } from "zod";

type EnvWithDb = CloudflareEnv & { DB?: D1Database };

const bodySchema = z.object({
	name: z.string().min(2).max(30),
	email: z.string().email(),
	password: z.string().min(6).max(72),
});

export async function POST(req: Request): Promise<Response> {
	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "Datos inválidos: nombre (2-30), email válido, contraseña (6+)" }, { status: 400 });
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

	const { name, email, password } = parsed.data;
	const passwordHash = await hashPassword(password);
	const result = await registerUser(db, { name, email, passwordHash });

	if ("error" in result) {
		return Response.json({ error: result.error }, { status: 409 });
	}

	const token = await createSessionToken(result.id);
	const jar = await cookies();
	jar.set(sessionCookieOptions(token));

	return Response.json({ id: result.id, handle: result.handle, email });
}
