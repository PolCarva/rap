import { getCloudflareContext } from "@opennextjs/cloudflare";

type EnvWithBeatUploads = CloudflareEnv & { BEAT_UPLOADS?: R2Bucket };

interface RouteContext {
	params: Promise<{ key: string[] }>;
}

function getBeatUploadsBucket(): R2Bucket | null {
	try {
		const { env } = getCloudflareContext();
		return (env as EnvWithBeatUploads).BEAT_UPLOADS ?? null;
	} catch {
		return null;
	}
}

function responseHeaders(object: R2ObjectBody): Headers {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("accept-ranges", "bytes");
	headers.set("cache-control", headers.get("cache-control") ?? "public, max-age=31536000, immutable");
	headers.set("content-type", headers.get("content-type") ?? "audio/mpeg");

	const range = object.range;
	if (!range) {
		headers.set("content-length", String(object.size));
		return headers;
	}

	if ("offset" in range && typeof range.offset === "number") {
		const length = range.length ?? object.size - range.offset;
		headers.set("content-length", String(length));
		headers.set("content-range", `bytes ${range.offset}-${range.offset + length - 1}/${object.size}`);
	} else if ("suffix" in range) {
		const length = Math.min(range.suffix, object.size);
		const start = object.size - length;
		headers.set("content-length", String(length));
		headers.set("content-range", `bytes ${start}-${object.size - 1}/${object.size}`);
	}

	return headers;
}

async function serve(req: Request, context: RouteContext): Promise<Response> {
	const bucket = getBeatUploadsBucket();
	if (!bucket) return Response.json({ error: "Storage de beats no configurado" }, { status: 503 });

	const { key: keyParts } = await context.params;
	const key = keyParts.join("/");
	if (!key.startsWith("beats/")) return Response.json({ error: "Beat inválido" }, { status: 400 });

	const object = await bucket.get(key, {
		range: req.headers,
	});

	if (!object) return Response.json({ error: "Beat no encontrado" }, { status: 404 });

	const headers = responseHeaders(object);
	return new Response(req.method === "HEAD" ? null : object.body, {
		status: object.range ? 206 : 200,
		headers,
	});
}

export async function GET(req: Request, context: RouteContext): Promise<Response> {
	return serve(req, context);
}

export async function HEAD(req: Request, context: RouteContext): Promise<Response> {
	return serve(req, context);
}
