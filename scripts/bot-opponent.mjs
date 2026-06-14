// Rival automático para probar la UI con un humano del otro lado.
// Se empareja, se pone "listo" y rapea en su turno. Uso:
//   node scripts/bot-opponent.mjs [modality] [name]
const BASE = "ws://127.0.0.1:8788";
const MODALITY = process.argv[2] ?? "minuto-libre";
const NAME = process.argv[3] ?? "MC Bot";
const SESSION_ID = crypto.randomUUID();
const log = (...a) => console.log("[bot]", ...a);

const mm = new WebSocket(`${BASE}/ws/matchmaking`);
mm.addEventListener("open", () =>
	mm.send(JSON.stringify({ kind: "queue", modality: MODALITY, name: NAME, sessionId: SESSION_ID, userId: null, isGuest: true })),
);
mm.addEventListener("message", (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.kind === "queued") log("en cola", MODALITY);
	if (msg.kind === "matched") {
		log(`emparejado como ${msg.role}`);
		playBattle(msg.battleId, msg.role);
	}
});

function playBattle(battleId, role) {
	const ws = new WebSocket(`${BASE}/ws/battle/${battleId}`);
	const sent = new Set();
	ws.addEventListener("open", () =>
		ws.send(JSON.stringify({ kind: "hello", role, name: NAME, sessionId: SESSION_ID, userId: null, isGuest: true })),
	);
	ws.addEventListener("message", (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.kind !== "snapshot") return;
		const s = msg.state;
		if (s.phase === "ready_check" && !s.players[role].ready) {
			ws.send(JSON.stringify({ kind: "ready" }));
		}
		if (s.phase === "turn" && s.activeRole === role && !sent.has(s.round)) {
			sent.add(s.round);
			// simular caption en vivo y luego enviar el verso
			const verse =
				process.env.VERSE ??
				"yo soy un rapero, te parto la caja, hoy te dejo en cero, clavo mi navaja";
			ws.send(JSON.stringify({ kind: "caption", text: verse }));
			setTimeout(() => ws.send(JSON.stringify({ kind: "verse", text: verse })), 1500);
		}
		if (s.phase === "result") {
			log("resultado:", s.verdict?.winner);
			process.exit(0);
		}
	});
}
