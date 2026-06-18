// Smoke test del matchmaking por ELO: valida segregación ranked/sin-ELO,
// prioridad por ELO cercano y ampliación progresiva del rango.
// Requiere el worker realtime en ws://127.0.0.1:8788 y los usuarios de prueba
// sembrados (elo1000/1050/1300/1500). Uso: node scripts/smoke-matchmaking.mjs
const BASE = process.argv[2] ?? "ws://127.0.0.1:8788";
const SECRET = process.env.JWT_SECRET ?? "rap-arena-dev-secret-change-in-prod";
const MODALITY = "minuto-libre";

const log = (...a) => console.log(...a);
let failures = 0;
function check(cond, msg) {
	if (cond) log(`  ✅ ${msg}`);
	else {
		failures++;
		console.error(`  ❌ ${msg}`);
	}
}

async function signToken(userId, ttl = 600) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const payload = JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttl });
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
	return `${btoa(payload)}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

/** Abre un socket de matchmaking y registra el último estado (queued/matched). */
async function join({ name, userId, elo, ranked, beatId }) {
	const ws = new WebSocket(`${BASE}/ws/matchmaking`);
	const player = { name, userId, elo, ranked, beatId, ws, state: "connecting", battleId: null, role: null };
	const authToken = userId ? await signToken(userId) : null;
	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`open timeout ${name}`)), 8000);
		ws.addEventListener("open", () => {
			clearTimeout(timer);
			ws.send(
				JSON.stringify({
					kind: "queue",
					modality: MODALITY,
					name,
					beatId,
					sessionId: crypto.randomUUID(),
					userId: userId ?? null,
					isGuest: !userId,
					ranked: Boolean(ranked),
					authToken,
				}),
			);
			resolve();
		});
		ws.addEventListener("error", () => reject(new Error(`ws error ${name}`)));
	});
	ws.addEventListener("message", (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.kind === "queued") player.state = "queued";
		if (msg.kind === "matched") {
			player.state = "matched";
			player.battleId = msg.battleId;
			player.role = msg.role;
			player.rankedResult = msg.ranked;
		}
		if (msg.kind === "error") player.state = `error:${msg.message}`;
	});
	return player;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const close = (...players) => players.forEach((p) => p.ws.close());

async function scenarioSegregation() {
	log("\n1) Segregación: 'por ELO' nunca se cruza con 'sin ELO'");
	const beatId = "mm-seg";
	const ranked = await join({ name: "RankedA", userId: "local:elo1000@test", elo: 1000, ranked: true, beatId });
	await wait(300);
	const guest = await join({ name: "GuestG", ranked: false, beatId });
	await wait(2500);
	check(ranked.state === "queued", "el jugador por ELO sigue en cola (no se cruzó con invitado)");
	check(guest.state === "queued", "el invitado sigue en cola (no se cruzó con ranked)");
	check(ranked.battleId === null && guest.battleId === null, "no se creó batalla cruzada");
	close(ranked, guest);
	await wait(500);
}

async function scenarioProximity() {
	log("\n2) Prioridad por ELO cercano");
	const beatId = "mm-prox";
	const far = await join({ name: "Elo1500", userId: "local:elo1500@test", elo: 1500, ranked: true, beatId });
	await wait(300);
	const low = await join({ name: "Elo1000", userId: "local:elo1000@test", elo: 1000, ranked: true, beatId });
	await wait(300);
	check(far.state === "queued" && low.state === "queued", "1500 y 1000 esperan (diferencia 500 > ventana inicial)");
	const mid = await join({ name: "Elo1050", userId: "local:elo1050@test", elo: 1050, ranked: true, beatId });
	await wait(1500);
	check(low.state === "matched" && mid.state === "matched", "1000 y 1050 (los más cercanos) se emparejaron");
	check(low.battleId && low.battleId === mid.battleId, "comparten la misma batalla");
	check(far.state === "queued", "1500 quedó en cola (no se robó al 1050 estando más lejos)");
	check(low.rankedResult === true, "la batalla quedó marcada como ranked");
	close(far, low, mid);
	await wait(500);
}

async function scenarioWidening() {
	log("\n3) Ampliación progresiva del rango (sin rival cercano)");
	const beatId = "mm-widen";
	const a = await join({ name: "Elo1000b", userId: "local:elo1000@test", elo: 1000, ranked: true, beatId });
	await wait(200);
	const b = await join({ name: "Elo1300", userId: "local:elo1300@test", elo: 1300, ranked: true, beatId });
	await wait(800);
	check(a.state === "queued" && b.state === "queued", "diferencia 300 no empareja de inmediato");
	log("     esperando a que el rango se amplíe con la espera…");
	for (let i = 0; i < 20 && !(a.state === "matched" && b.state === "matched"); i++) await wait(1000);
	check(a.state === "matched" && b.state === "matched", "tras esperar, el rango se amplió y se emparejaron");
	check(a.battleId && a.battleId === b.battleId, "comparten la misma batalla");
	close(a, b);
	await wait(300);
}

async function main() {
	await scenarioSegregation();
	await scenarioProximity();
	await scenarioWidening();
	log("");
	if (failures > 0) {
		console.error(`❌ ${failures} comprobación(es) fallaron`);
		process.exit(1);
	}
	log("✅ Matchmaking por ELO: segregación, prioridad y ampliación OK");
	process.exit(0);
}

main().catch((e) => {
	console.error("❌", e.message);
	process.exit(1);
});
