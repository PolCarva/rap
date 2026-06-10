import { getBeats, removeBeat, saveBeat } from "@/lib/data";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";

type EnvWithBackoffice = CloudflareEnv & { BACKOFFICE_PASSWORD?: string };

const beatSchema = z.object({
	id: z.string().min(1).max(80).optional(),
	name: z.string().min(1).max(80),
	producer: z.string().max(80).nullable().optional(),
	audioUrl: z.string().url(),
	bpm: z.number().int().min(40).max(220).nullable().optional(),
	isActive: z.boolean().optional(),
});

function backofficePassword(): string | null {
	try {
		const { env } = getCloudflareContext();
		return (env as EnvWithBackoffice).BACKOFFICE_PASSWORD ?? process.env.BACKOFFICE_PASSWORD ?? null;
	} catch {
		return process.env.BACKOFFICE_PASSWORD ?? null;
	}
}

function requireBackoffice(req: Request): Response | null {
	const secret = backofficePassword();
	if (!secret) return Response.json({ error: "Backoffice no configurado" }, { status: 503 });
	const key = req.headers.get("x-backoffice-key");
	if (key !== secret) return Response.json({ error: "Clave inválida" }, { status: 401 });
	return null;
}

export async function GET(req: Request): Promise<Response> {
	const denied = requireBackoffice(req);
	if (denied) return denied;
	return Response.json({ beats: await getBeats(true) });
}

export async function POST(req: Request): Promise<Response> {
	const denied = requireBackoffice(req);
	if (denied) return denied;

	const parsed = beatSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return Response.json({ error: "Beat inválido" }, { status: 400 });

	try {
		const beat = await saveBeat(parsed.data);
		return Response.json({ beat });
	} catch {
		return Response.json({ error: "No se pudo guardar el beat" }, { status: 500 });
	}
}

export async function DELETE(req: Request): Promise<Response> {
	const denied = requireBackoffice(req);
	if (denied) return denied;

	const id = new URL(req.url).searchParams.get("id");
	if (!id) return Response.json({ error: "Falta id" }, { status: 400 });

	try {
		await removeBeat(id);
		return Response.json({ ok: true });
	} catch {
		return Response.json({ error: "No se pudo borrar el beat" }, { status: 500 });
	}
}
