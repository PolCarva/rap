// Smoke de revancha: batalla con ganador → ambos piden revancha → la sala
// resetea (ready_check, battleId nuevo, sin verdict) → segunda batalla cierra.
const BASE = "ws://127.0.0.1:8787";
const MODALITY = "minuto-libre";

const fail = (m) => {
	console.error("❌", m);
	process.exit(1);
};

function queue(name) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`${BASE}/ws/matchmaking`);
		const sessionId = crypto.randomUUID();
		const timer = setTimeout(() => reject(new Error(`mm timeout ${name}`)), 10000);
		ws.addEventListener("open", () =>
			ws.send(JSON.stringify({ kind: "queue", modality: MODALITY, name, sessionId, userId: null, isGuest: true })),
		);
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.kind === "matched") {
				clearTimeout(timer);
				resolve({ name, ...msg });
			}
			if (msg.kind === "error") reject(new Error(msg.message));
		});
		ws.addEventListener("error", () => reject(new Error(`ws error mm ${name}`)));
	});
}

function play(match) {
	return new Promise((resolve, reject) => {
		const { battleId, role, name } = match;
		const ws = new WebSocket(`${BASE}/ws/battle/${battleId}`);
		const timer = setTimeout(() => reject(new Error(`battle timeout ${name}`)), 40000);
		const sent = new Set();
		const resultIds = new Set();
		let firstBattleId = null;
		let rematchSent = false;

		ws.addEventListener("open", () => ws.send(JSON.stringify({ kind: "hello", role, name })));
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.kind !== "snapshot") return;
			const s = msg.state;
			if (!firstBattleId) firstBattleId = s.battleId;

			if (s.phase === "ready_check" && !s.players[role].ready) {
				ws.send(JSON.stringify({ kind: "ready" }));
			}
			if (s.phase === "turn" && s.activeRole === role && !sent.has(`${s.battleId}:${s.round}`)) {
				sent.add(`${s.battleId}:${s.round}`);
				// p1 rapea, p2 calla → ganador garantizado p1.
				const text = role === "p1" ? "vengo del barrio sin miedo, con la rima te enredo, prendo fuego y no me quedo" : "";
				ws.send(JSON.stringify({ kind: "verse", text }));
			}
			if (s.phase === "result" && s.verdict && s.verdict.winner !== "draw" && !resultIds.has(s.battleId)) {
				resultIds.add(s.battleId);
				if (resultIds.size === 1 && !rematchSent) {
					rematchSent = true;
					if (s.battleId !== firstBattleId) return reject(new Error("battleId cambió antes de la revancha"));
					console.log(`  · ${name}: resultado 1 (ganador ${s.verdict.winner}), pidiendo revancha`);
					setTimeout(() => ws.send(JSON.stringify({ kind: "rematch" })), 300);
				} else if (resultIds.size === 2) {
					if (s.battleId === firstBattleId) return reject(new Error("la revancha no generó battleId nuevo"));
					clearTimeout(timer);
					console.log(`  · ${name}: resultado 2 OK (battleId nuevo ${s.battleId.slice(0, 8)})`);
					resolve(s);
					ws.close();
				}
			}
			if (s.phase === "ready_check" && rematchSent && s.verdict === null && resultIds.size === 1) {
				if (s.battleId === firstBattleId) return reject(new Error("ready_check de revancha sin battleId nuevo"));
			}
			if (s.phase === "aborted") reject(new Error("aborted"));
		});
		ws.addEventListener("error", () => reject(new Error(`ws error battle ${name}`)));
	});
}

const p1p = queue("MC Uno");
await new Promise((r) => setTimeout(r, 200));
const [p1, p2] = await Promise.all([p1p, queue("MC Dos")]);
console.log("1) match OK, jugando batalla 1 + revancha + batalla 2…");
await Promise.all([play(p1), play(p2)]).catch((e) => fail(e.message));
console.log("✅ revancha de punta a punta");
process.exit(0);
