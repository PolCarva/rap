// Verifica el endpoint /ws/transcribe: abre el WS, manda config + un poco de
// audio falso, y reporta qué responde el worker. Sin DEEPGRAM_API_KEY debe
// devolver {type:"Error", ...}. Uso: node scripts/smoke-transcribe.mjs
const URL = process.argv[2] ?? "ws://127.0.0.1:8787/ws/transcribe";

const ws = new WebSocket(URL);
ws.binaryType = "arraybuffer";
const timer = setTimeout(() => {
	console.log("⏱  sin respuesta en 5s");
	process.exit(1);
}, 5000);

ws.addEventListener("open", () => {
	console.log("· WS abierto");
	ws.send(JSON.stringify({ type: "config", sampleRate: 16000 }));
	// un chunk de PCM silencioso
	ws.send(new Int16Array(1600).buffer);
});
ws.addEventListener("message", (ev) => {
	clearTimeout(timer);
	console.log("← worker:", typeof ev.data === "string" ? ev.data : `[binario ${ev.data.byteLength}b]`);
	process.exit(0);
});
ws.addEventListener("close", (e) => console.log("· cerrado", e.code));
ws.addEventListener("error", () => {
	clearTimeout(timer);
	console.log("✘ error de WS");
	process.exit(1);
});
