// Prueba end-to-end del pipeline de transcripción con la key real: streamea un
// PCM16 mono 16kHz a /ws/transcribe (como el browser) y muestra lo que Deepgram
// devuelve, palabra por palabra. Uso: node scripts/smoke-deepgram.mjs [pcmFile]
import { readFileSync } from "node:fs";

const URL = "ws://127.0.0.1:8788/ws/transcribe";
const PCM = process.argv[2] ?? "/tmp/dg.pcm";
const pcm = readFileSync(PCM);

const ws = new WebSocket(URL);
ws.binaryType = "arraybuffer";
let finals = "";

ws.addEventListener("open", async () => {
	console.log("· WS abierto, mando config + audio…");
	ws.send(JSON.stringify({ type: "config", sampleRate: 16000 }));

	// Streamear en chunks de 100ms (3200 bytes = 1600 muestras int16).
	const CHUNK = 3200;
	for (let i = 0; i < pcm.length; i += CHUNK) {
		const slice = pcm.subarray(i, i + CHUNK);
		ws.send(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength));
		await new Promise((r) => setTimeout(r, 80));
	}
	// Dar tiempo a los finales y cerrar.
	setTimeout(() => {
		console.log("\n=== TRANSCRIPCIÓN FINAL ===");
		console.log(finals.trim() || "(vacío)");
		process.exit(0);
	}, 2500);
});

ws.addEventListener("message", async (ev) => {
	let raw = ev.data;
	if (raw instanceof Blob) raw = await raw.text();
	if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString("utf8");
	console.log("  RAW:", String(raw).slice(0, 300));
	let msg;
	try {
		msg = JSON.parse(raw);
	} catch {
		return;
	}
	if (msg.type === "Results") {
		const text = msg.channel?.alternatives?.[0]?.transcript ?? "";
		if (msg.is_final && text) finals += ` ${text}`;
	}
});
ws.addEventListener("close", (e) => console.log("· WS cerrado", e.code, e.reason));

ws.addEventListener("error", () => {
	console.log("✘ error de WS");
	process.exit(1);
});
setTimeout(() => {
	console.log("⏱ timeout");
	process.exit(1);
}, 20000);
