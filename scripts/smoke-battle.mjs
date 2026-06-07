// Smoke test del walking skeleton: empareja dos jugadores y los conduce por
// toda la máquina de estados hasta el veredicto. Usa el WebSocket nativo de
// Node 22. Uso: node scripts/smoke-battle.mjs [baseUrl]
const BASE = process.argv[2] ?? "ws://127.0.0.1:8787";
const MODALITY = process.env.MODALITY ?? "minuto-libre";

const log = (...a) => console.log(...a);
const fail = (m) => {
	console.error("❌", m);
	process.exit(1);
};

function queue(name) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`${BASE}/ws/matchmaking`);
		const timer = setTimeout(() => reject(new Error(`matchmaking timeout (${name})`)), 10000);
		ws.addEventListener("open", () =>
			ws.send(JSON.stringify({ kind: "queue", modality: MODALITY, name })),
		);
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.kind === "queued") log(`  · ${name} en cola`);
			if (msg.kind === "matched") {
				clearTimeout(timer);
				log(`  · ${name} emparejado como ${msg.role} (batalla ${msg.battleId.slice(0, 8)})`);
				resolve({ name, ...msg });
			}
			if (msg.kind === "error") reject(new Error(msg.message));
		});
		ws.addEventListener("error", () => reject(new Error(`ws error matchmaking (${name})`)));
	});
}

function playBattle(match) {
	return new Promise((resolve, reject) => {
		const { battleId, role, name } = match;
		const ws = new WebSocket(`${BASE}/ws/battle/${battleId}`);
		const timer = setTimeout(() => reject(new Error(`battle timeout (${name})`)), 20000);
		const versesSent = new Set();

		ws.addEventListener("open", () =>
			ws.send(JSON.stringify({ kind: "hello", role, name })),
		);
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.kind !== "snapshot") return;
			const s = msg.state;

			if (s.phase === "ready_check" && !s.players[role].ready) {
				ws.send(JSON.stringify({ kind: "ready" }));
			}
			if (s.phase === "turn" && s.activeRole === role && !versesSent.has(s.round)) {
				versesSent.add(s.round);
				ws.send(JSON.stringify({ kind: "verse", text: `${name} ronda ${s.round} ${MODALITY} fuego` }));
			}
			if (s.phase === "result") {
				clearTimeout(timer);
				resolve({ role, state: s });
				ws.close();
			}
			if (s.phase === "aborted") {
				clearTimeout(timer);
				reject(new Error("battle aborted"));
			}
		});
		ws.addEventListener("error", () => reject(new Error(`ws error battle (${name})`)));
	});
}

(async () => {
	log("1) Matchmaking…");
	const p1Promise = queue("MC Uno");
	await new Promise((r) => setTimeout(r, 200)); // que MC Uno entre a la cola primero
	const [p1, p2] = await Promise.all([p1Promise, queue("MC Dos")]);

	if (p1.battleId !== p2.battleId) fail("battleId distinto entre jugadores");
	if (new Set([p1.role, p2.role]).size !== 2) fail("roles no son únicos");
	log("2) Jugando la batalla (ready → countdown → turnos → juicio)…");

	const [r1, r2] = await Promise.all([playBattle(p1), playBattle(p2)]);
	const verdict = r1.state.verdict;
	if (!verdict) fail("no llegó veredicto");
	if (r1.state.phase !== "result" || r2.state.phase !== "result") fail("no terminó en 'result'");

	log("3) ✅ Veredicto:");
	log(`     ganador: ${verdict.winner}  | scores p1=${verdict.scores.p1} p2=${verdict.scores.p2}`);
	log(`     versos p1: ${JSON.stringify(r1.state.verses.p1)}`);
	log(`     versos p2: ${JSON.stringify(r1.state.verses.p2)}`);
	log("\n✅ Walking skeleton funciona de punta a punta.");
	process.exit(0);
})().catch((e) => fail(e.message));
