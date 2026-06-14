// Smoke test del walking skeleton: empareja dos jugadores y los conduce por
// toda la máquina de estados hasta el veredicto. Usa el WebSocket nativo de
// Node 22. Uso: node scripts/smoke-battle.mjs [baseUrl]
const BASE = process.argv[2] ?? "ws://127.0.0.1:8788";
const MODALITY = process.env.MODALITY ?? "minuto-libre";
const DEV_BOT = process.env.DEV_BOT === "1";

const log = (...a) => console.log(...a);
const fail = (m) => {
	console.error("❌", m);
	process.exit(1);
};

function queue(name) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`${BASE}/ws/matchmaking`);
		const sessionId = crypto.randomUUID();
		const timer = setTimeout(() => reject(new Error(`matchmaking timeout (${name})`)), 10000);
		ws.addEventListener("open", () =>
			ws.send(JSON.stringify({ kind: "queue", modality: MODALITY, name, sessionId, userId: null, isGuest: true, devBot: DEV_BOT })),
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
				const w = s.words.length ? ` metiendo ${s.words.join(" y ")}` : "";
				const lines = {
					p1: `Vengo con el flow afilado${w}, te piso el ritmo y te dejo callado, soy el más buscado del tablado.`,
					p2: `Respondo a tu ataque sin pensarlo${w}, mi punchline te cae como un rayo, y en cada rima yo te desarmo.`,
				};
				// EMPTY=p2 simula un jugador que no rapeó (verso vacío).
				const text = process.env.EMPTY === role ? "" : lines[role];
				ws.send(JSON.stringify({ kind: "verse", text }));
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
	if (DEV_BOT) {
		const match = await queue("MC Uno");
		log("2) Jugando contra bot dev (ready → countdown → turnos → juicio)…");
		const result = await playBattle(match);
		const verdict = result.state.verdict;
		if (!verdict) fail("no llegó veredicto");
		if (result.state.phase !== "result") fail("no terminó en 'result'");
		log("3) ✅ Veredicto del juez:");
		log(`     ganador: ${verdict.winner}  | scores p1=${verdict.scores.p1} p2=${verdict.scores.p2}`);
		log(`     modelo: ${verdict.model ?? "(heurística)"}`);
		log(`     fallo: ${verdict.rationale}`);
		log("\n✅ Batalla contra bot de punta a punta.");
		process.exit(0);
	}
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

	log("3) ✅ Veredicto del juez:");
	log(`     ganador: ${verdict.winner}  | scores p1=${verdict.scores.p1} p2=${verdict.scores.p2}`);
	log(`     modelo: ${verdict.model ?? "(heurística)"}`);
	log(`     fallo: ${verdict.rationale}`);
	if (verdict.detail) {
		for (const role of ["p1", "p2"]) {
			const d = verdict.detail[role];
			log(`     ${role} (${d.total}): ${JSON.stringify(d.criteria)}  — ${d.comment}`);
		}
	} else {
		log("     ⚠️  sin detalle por criterios (¿juez en modo heurístico?)");
	}
	log("\n✅ Batalla + juez de punta a punta.");
	process.exit(0);
})().catch((e) => fail(e.message));
