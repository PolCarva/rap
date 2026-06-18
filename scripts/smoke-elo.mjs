// Smoke test del ciclo de ELO de punta a punta. Juega una batalla "por ELO"
// real (un MC manda versos vacíos y pierde) y verifica que la D1 mueve el ELO;
// después juega una "sin ELO" entre dos cuentas y verifica que NO lo mueve.
// Requiere el worker realtime en 127.0.0.1:8788 con usuarios de prueba.
import { execFileSync } from "node:child_process";

const BASE = process.argv[2] ?? "ws://127.0.0.1:8788";
const SECRET = process.env.JWT_SECRET ?? "rap-arena-dev-secret-change-in-prod";
const MODALITY = "minuto-libre";
const WINNER = "local:elo1000@test"; // p1
const LOSER = "local:elo1050@test"; // p2 (manda versos vacíos)

const log = (...a) => console.log(...a);
let failures = 0;
const check = (cond, msg) => {
	if (cond) log(`  ✅ ${msg}`);
	else {
		failures++;
		console.error(`  ❌ ${msg}`);
	}
};

function d1(sql) {
	const out = execFileSync(
		"npx",
		["wrangler", "d1", "execute", "rap-db", "--local", "--persist-to", "../../.wrangler-shared/state", "--json", "--command", sql],
		{ cwd: "apps/realtime", encoding: "utf8" },
	);
	return JSON.parse(out);
}

function userStats(id) {
	const res = d1(`SELECT elo, battles, wins, losses FROM users WHERE id = '${id}'`);
	return res[0].results[0];
}

function resetUsers() {
	d1(`UPDATE users SET elo=1000, battles=20, wins=0, losses=0, draws=0, current_streak=0 WHERE id IN ('${WINNER}','${LOSER}')`);
}

async function signToken(userId) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const payload = JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 600 });
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
	return `${btoa(payload)}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

function queue({ name, userId, ranked, beatId }) {
	return new Promise(async (resolve, reject) => {
		const ws = new WebSocket(`${BASE}/ws/matchmaking`);
		const sessionId = crypto.randomUUID();
		const authToken = await signToken(userId);
		const timer = setTimeout(() => reject(new Error(`matchmaking timeout (${name})`)), 12000);
		ws.addEventListener("open", () =>
			ws.send(JSON.stringify({ kind: "queue", modality: MODALITY, name, beatId, sessionId, userId, isGuest: false, ranked, authToken })),
		);
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.kind === "matched") {
				clearTimeout(timer);
				resolve({ name, sessionId, userId, ...msg });
				ws.close();
			}
			if (msg.kind === "error") reject(new Error(msg.message));
		});
		ws.addEventListener("error", () => reject(new Error(`ws matchmaking error (${name})`)));
	});
}

function playBattle(match, { empty }) {
	return new Promise((resolve, reject) => {
		const { battleId, role, name, sessionId, userId } = match;
		const ws = new WebSocket(`${BASE}/ws/battle/${battleId}`);
		const timer = setTimeout(() => reject(new Error(`battle timeout (${name})`)), 30000);
		const versesSent = new Set();
		ws.addEventListener("open", () =>
			ws.send(JSON.stringify({ kind: "hello", role, name, sessionId, userId, isGuest: false })),
		);
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.kind !== "snapshot") return;
			const s = msg.state;
			if (s.phase === "ready_check" && !s.players[role].ready) ws.send(JSON.stringify({ kind: "ready" }));
			if (s.phase === "turn" && s.activeRole === role && !versesSent.has(s.round)) {
				versesSent.add(s.round);
				const line = `Vengo con flow afilado, te piso el ritmo y te dejo callado, soy el más buscado del tablado.`;
				ws.send(JSON.stringify({ kind: "verse", text: empty ? "" : line }));
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
		ws.addEventListener("error", () => reject(new Error(`ws battle error (${name})`)));
	});
}

async function runBattle({ ranked, beatId }) {
	const p1Promise = queue({ name: "Winner", userId: WINNER, ranked, beatId });
	await new Promise((r) => setTimeout(r, 250));
	const [p1, p2] = await Promise.all([p1Promise, queue({ name: "Loser", userId: LOSER, ranked, beatId })]);
	if (p1.battleId !== p2.battleId) throw new Error("battleId distinto");
	// p2 (Loser) manda versos vacíos para perder de forma decisiva.
	const [r1] = await Promise.all([
		playBattle(p1, { empty: false }),
		playBattle(p2, { empty: true }),
	]);
	// Esperar a que la persistencia del resultado termine.
	await new Promise((r) => setTimeout(r, 1500));
	return r1.state.verdict;
}

async function main() {
	log("1) Batalla POR ELO (decisiva): debe mover ELO");
	resetUsers();
	const before = { w: userStats(WINNER), l: userStats(LOSER) };
	const v1 = await runBattle({ ranked: true, beatId: "elo-ranked" });
	check(v1?.elo?.ranked === true, "el veredicto reporta elo.ranked = true");
	check(v1?.winner === "p1", `ganó p1 (el que rapeó) — winner=${v1?.winner}`);
	const after = { w: userStats(WINNER), l: userStats(LOSER) };
	log(`     winner ELO ${before.w.elo} → ${after.w.elo} | loser ELO ${before.l.elo} → ${after.l.elo}`);
	check(after.w.elo > before.w.elo, "el ganador subió ELO");
	check(after.l.elo < before.l.elo, "el perdedor bajó ELO");
	check(after.w.battles === before.w.battles + 1 && after.l.battles === before.l.battles + 1, "ambos suman 1 batalla");
	check(after.w.wins === before.w.wins + 1 && after.l.losses === before.l.losses + 1, "se registró victoria/derrota");
	check(
		after.w.elo - before.w.elo === -(after.l.elo - before.l.elo),
		"el ELO es conservativo (lo que gana uno lo pierde el otro)",
	);

	log("\n2) Batalla SIN ELO entre dos cuentas: NO debe mover ELO (regla 6)");
	resetUsers();
	const cBefore = { w: userStats(WINNER), l: userStats(LOSER) };
	const v2 = await runBattle({ ranked: false, beatId: "elo-casual" });
	check(v2?.elo?.ranked === false, "el veredicto reporta elo.ranked = false");
	const cAfter = { w: userStats(WINNER), l: userStats(LOSER) };
	log(`     winner ELO ${cBefore.w.elo} → ${cAfter.w.elo} | loser ELO ${cBefore.l.elo} → ${cAfter.l.elo}`);
	check(cAfter.w.elo === cBefore.w.elo && cAfter.l.elo === cBefore.l.elo, "el ELO quedó intacto");
	check(
		cAfter.w.battles === cBefore.w.battles && cAfter.l.battles === cBefore.l.battles,
		"no se sumaron batallas a las stats",
	);

	log("");
	if (failures > 0) {
		console.error(`❌ ${failures} comprobación(es) fallaron`);
		process.exit(1);
	}
	log("✅ Ciclo de ELO: suma/resta correcta en ranked, intacto en casual");
	process.exit(0);
}

main().catch((e) => {
	console.error("❌", e.message);
	process.exit(1);
});
