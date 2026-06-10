import { AppNav } from "@/components/AppNav";
import { BattleApp } from "@/components/battle/BattleApp";

export default function ArenaPage() {
	return (
		<main style={{ minHeight: "100vh", background: "var(--ink)", overflowY: "auto" }}>
			<div className="arena-grain" />
			<div className="arena-vignette" />
			<AppNav status="SALA DE PREPARACION" />
			<BattleApp />
		</main>
	);
}
