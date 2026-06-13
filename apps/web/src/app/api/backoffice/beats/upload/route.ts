import { requireBackoffice } from "@/lib/backoffice";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type EnvWithBeatUploads = CloudflareEnv & { BEAT_UPLOADS?: R2Bucket };

const MAX_MP3_BYTES = 25 * 1024 * 1024;

function getBeatUploadsBucket(): R2Bucket | null {
	try {
		const { env } = getCloudflareContext();
		return (env as EnvWithBeatUploads).BEAT_UPLOADS ?? null;
	} catch {
		return null;
	}
}

function fileBaseName(name: string): string {
	return name
		.replace(/\.[^.]+$/, "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48) || "beat";
}

function keyUrl(origin: string, key: string): string {
	const encodedKey = key.split("/").map(encodeURIComponent).join("/");
	return `${origin}/api/beats/audio/${encodedKey}`;
}

function isMp3(file: File): boolean {
	const type = file.type.toLowerCase();
	return type === "audio/mpeg" || type === "audio/mp3" || file.name.toLowerCase().endsWith(".mp3");
}

export async function POST(req: Request): Promise<Response> {
	const denied = requireBackoffice(req);
	if (denied) return denied;

	const bucket = getBeatUploadsBucket();
	if (!bucket) {
		return Response.json({ error: "Storage de beats no configurado" }, { status: 503 });
	}

	const form = await req.formData().catch(() => null);
	const file = form?.get("file");
	if (!(file instanceof File)) {
		return Response.json({ error: "Falta archivo MP3" }, { status: 400 });
	}
	if (!isMp3(file)) {
		return Response.json({ error: "Subí un archivo .mp3" }, { status: 400 });
	}
	if (file.size <= 0 || file.size > MAX_MP3_BYTES) {
		return Response.json({ error: "El MP3 debe pesar hasta 25 MB" }, { status: 400 });
	}

	const base = fileBaseName(file.name);
	const key = `beats/${Date.now()}-${crypto.randomUUID()}-${base}.mp3`;
	await bucket.put(key, await file.arrayBuffer(), {
		httpMetadata: {
			contentType: "audio/mpeg",
			cacheControl: "public, max-age=31536000, immutable",
		},
		customMetadata: {
			originalName: file.name,
		},
	});

	return Response.json({
		key,
		audioUrl: keyUrl(new URL(req.url).origin, key),
		fileName: file.name,
	});
}
