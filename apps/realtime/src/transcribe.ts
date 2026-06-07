import type { Env } from "./env";

/**
 * Proxy de transcripción en streaming. El browser abre un WebSocket acá y
 * manda audio PCM (linear16). Nosotros abrimos un WebSocket saliente a
 * Deepgram (con la API key server-side) y reenviamos el audio; los resultados
 * interinos (palabra-por-palabra) y finales vuelven al browser tal cual.
 *
 * Protocolo browser -> worker:
 *   1) primer mensaje (texto): {"type":"config","sampleRate":16000}
 *   2) luego: audio binario (Int16 PCM mono)
 * Protocolo worker -> browser: los JSON de Deepgram, más {"type":"Error",...}.
 */
function deepgramUrl(sampleRate: number): string {
	const params = new URLSearchParams({
		model: "nova-2",
		language: "es",
		interim_results: "true",
		smart_format: "true",
		encoding: "linear16",
		sample_rate: String(sampleRate),
		channels: "1",
	});
	return `https://api.deepgram.com/v1/listen?${params.toString()}`;
}

async function openDeepgram(env: Env, sampleRate: number, browser: WebSocket): Promise<WebSocket | null> {
	const resp = await fetch(deepgramUrl(sampleRate), {
		headers: {
			Upgrade: "websocket",
			Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
		},
	});
	const dg = resp.webSocket;
	if (!dg) return null;
	dg.accept();
	// Deepgram -> browser
	dg.addEventListener("message", (e) => {
		try {
			browser.send(e.data);
		} catch {
			/* socket cerrado */
		}
	});
	dg.addEventListener("close", () => {
		try {
			browser.close();
		} catch {
			/* ya cerrado */
		}
	});
	dg.addEventListener("error", () => {
		try {
			browser.close();
		} catch {
			/* ya cerrado */
		}
	});
	return dg;
}

export async function handleTranscribe(request: Request, env: Env): Promise<Response> {
	if (request.headers.get("Upgrade") !== "websocket") {
		return new Response("Expected WebSocket", { status: 426 });
	}

	const pair = new WebSocketPair();
	const client = pair[0];
	const server = pair[1];
	server.accept();
	// Que los frames binarios lleguen como ArrayBuffer (no Blob).
	try {
		(server as unknown as { binaryType: string }).binaryType = "arraybuffer";
	} catch {
		/* algunos runtimes no lo soportan */
	}

	if (!env.DEEPGRAM_API_KEY) {
		server.send(JSON.stringify({ type: "Error", message: "Falta DEEPGRAM_API_KEY en apps/realtime/.dev.vars" }));
		server.close();
		return new Response(null, { status: 101, webSocket: client });
	}

	let dg: WebSocket | null = null;
	let opening = false;

	server.addEventListener("message", async (e) => {
		// El primer mensaje (config) abre Deepgram con el sample rate real.
		if (!dg) {
			if (opening) return;
			opening = true;
			let sampleRate = 16000;
			if (typeof e.data === "string") {
				try {
					const cfg = JSON.parse(e.data) as { type?: string; sampleRate?: number };
					if (cfg.type === "config" && cfg.sampleRate) sampleRate = cfg.sampleRate;
				} catch {
					/* config inválida: usar default */
				}
			}
			dg = await openDeepgram(env, sampleRate, server);
			if (!dg) {
				server.send(JSON.stringify({ type: "Error", message: "No se pudo conectar a Deepgram" }));
				server.close();
			}
			return;
		}
		// Resto: audio (binario) o control. Reenviar a Deepgram como binario real.
		try {
			const data = e.data;
			if (typeof data === "string") {
				dg.send(data);
			} else if (data instanceof ArrayBuffer) {
				dg.send(data);
			} else {
				// Blob u otro: convertir a ArrayBuffer (si no, se enviaría "[object Blob]").
				dg.send(await (data as Blob).arrayBuffer());
			}
		} catch {
			/* socket cerrado */
		}
	});

	server.addEventListener("close", () => {
		try {
			dg?.send(JSON.stringify({ type: "CloseStream" }));
			dg?.close();
		} catch {
			/* ya cerrado */
		}
	});

	return new Response(null, { status: 101, webSocket: client });
}
