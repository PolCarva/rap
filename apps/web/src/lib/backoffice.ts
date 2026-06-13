import { getCloudflareContext } from "@opennextjs/cloudflare";

type EnvWithBackoffice = CloudflareEnv & { BACKOFFICE_PASSWORD?: string };

function backofficePassword(): string | null {
	try {
		const { env } = getCloudflareContext();
		return (env as EnvWithBackoffice).BACKOFFICE_PASSWORD ?? process.env.BACKOFFICE_PASSWORD ?? null;
	} catch {
		return process.env.BACKOFFICE_PASSWORD ?? null;
	}
}

export function requireBackoffice(req: Request): Response | null {
	const secret = backofficePassword();
	if (!secret) return Response.json({ error: "Backoffice no configurado" }, { status: 503 });
	const key = req.headers.get("x-backoffice-key");
	if (key !== secret) return Response.json({ error: "Clave inválida" }, { status: 401 });
	return null;
}
