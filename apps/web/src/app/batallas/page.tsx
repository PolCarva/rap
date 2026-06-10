import { getRecentBattles, parseBattleWords } from "@/lib/data";
import { AppNav } from "@/components/AppNav";
import { MODALITIES, modalityIdSchema } from "@rap/shared";

export const dynamic = "force-dynamic";

export default async function BattlesPage() {
	const battles = await getRecentBattles(50);

	return (
		<main className="app-page-shell">
			<AppNav status="HISTORIAL GLOBAL" />
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
				<h1 className="page-title">Batallas</h1>
				<section className="grid gap-3">
					{battles.length === 0 ? (
						<p className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-10 text-center text-sm text-white/45">
							Todavía no hay historial persistido.
						</p>
					) : (
						battles.map((battle) => {
							const words = parseBattleWords(battle);
							const winner =
								battle.winner === "draw"
									? "Empate"
									: battle.winner === "p1"
										? battle.player1Name
										: battle.winner === "p2"
											? battle.player2Name
											: battle.status === "aborted"
												? "Abandonada"
												: "En curso";
							const modality = modalityIdSchema.safeParse(battle.modality);
							return (
								<article key={battle.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<p className="text-xs uppercase text-fuchsia-300">
												{modality.success ? MODALITIES[modality.data].name : battle.modality}
											</p>
											<h2 className="mt-1 text-lg font-black">
												{battle.player1Name} <span className="text-white/25">vs</span> {battle.player2Name}
											</h2>
										</div>
										<div className="text-right">
											<p className="text-xs text-white/35">Ganador</p>
											<p className="font-bold text-cyan-200">{winner}</p>
										</div>
									</div>
									<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/45">
										<span>
											Score {battle.scoreP1 ?? "-"} / {battle.scoreP2 ?? "-"}
										</span>
										{battle.beatName && <span>Beat: {battle.beatName}</span>}
										{words.map((word) => (
											<span key={word} className="rounded border border-amber-300/30 px-2 py-0.5 text-amber-200/80">
												{word}
											</span>
										))}
									</div>
								</article>
							);
						})
					)}
				</section>
			</div>
		</main>
	);
}
