// Ejecuta smoke-battle en las modalidades principales contra el Worker local.
// Requiere `npm run dev:realtime` en otra terminal.
import { spawn } from "node:child_process";

const MODALITIES = ["minuto-libre", "4x4", "palabras", "deconceptos"];

function runSmoke(env) {
	return new Promise((resolve, reject) => {
		const child = spawn("node", ["scripts/smoke-battle.mjs"], {
			stdio: "inherit",
			env: { ...process.env, ...env },
		});
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`smoke failed: ${JSON.stringify(env)}`));
		});
	});
}

for (const modality of MODALITIES) {
	console.log(`\n=== modalidad: ${modality} ===`);
	await runSmoke({ MODALITY: modality });
}

console.log("\n=== verso vacío: p2 ===");
await runSmoke({ MODALITY: "minuto-libre", EMPTY: "p2" });

console.log("\n✅ smoke-suite completa");
