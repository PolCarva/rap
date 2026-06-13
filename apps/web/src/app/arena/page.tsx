import { AppNav } from "@/components/AppNav";
import { BattleApp } from "@/components/battle/BattleApp";
import { MODALITY_IDS, type ModalityId } from "@rap/shared";

type ArenaSearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseInitialModality(value: string | string[] | undefined): ModalityId | undefined {
	const raw = Array.isArray(value) ? value[0] : value;
	return MODALITY_IDS.includes(raw as ModalityId) ? (raw as ModalityId) : undefined;
}

export default async function ArenaPage({ searchParams }: { searchParams: ArenaSearchParams }) {
	const params = await searchParams;
	const initialModality = parseInitialModality(params.modo);

	return (
		<main style={{ minHeight: "100vh", background: "var(--ink)", overflowY: "auto" }}>
			<div className="arena-grain" />
			<div className="arena-vignette" />
			<AppNav status="SALA DE PREPARACION" />
			<BattleApp initialModality={initialModality} />
		</main>
	);
}
