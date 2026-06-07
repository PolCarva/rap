import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";

/**
 * Proxy de transcripción. El browser manda un fragmento de audio (base64) y
 * acá lo reenviamos a OpenRouter con la API key (server-side, nunca expuesta).
 * Cross-browser: el cliente captura con MediaRecorder, esto transcribe.
 */

const bodySchema = z.object({
	data: z.string().min(1), // base64 crudo (sin data URI)
	format: z.string().min(1), // "webm" | "ogg" | "m4a" | "wav" ...
});

const DEFAULT_MODEL = "openai/gpt-4o-mini-transcribe";

export async function POST(req: Request): Promise<Response> {
	const { env } = getCloudflareContext();
	const cfEnv = env as unknown as { OPENROUTER_API_KEY?: string; OPENROUTER_STT_MODEL?: string };
	const apiKey = cfEnv.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY;
	const model = cfEnv.OPENROUTER_STT_MODEL ?? process.env.OPENROUTER_STT_MODEL ?? DEFAULT_MODEL;

	if (!apiKey) {
		return Response.json(
			{ error: "Falta OPENROUTER_API_KEY. Agregала en apps/web/.dev.vars" },
			{ status: 500 },
		);
	}

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "Body inválido" }, { status: 400 });
	}

	try {
		const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"X-Title": "Rap Arena",
			},
			body: JSON.stringify({
				model,
				language: "es",
				input_audio: { data: parsed.data.data, format: parsed.data.format },
			}),
		});

		if (!res.ok) {
			const detail = await res.text().catch(() => "");
			return Response.json(
				{ error: `OpenRouter ${res.status}`, detail: detail.slice(0, 300) },
				{ status: 502 },
			);
		}

		const json = (await res.json()) as { text?: string };
		return Response.json({ text: json.text ?? "" });
	} catch {
		return Response.json({ error: "No se pudo contactar a OpenRouter" }, { status: 502 });
	}
}
