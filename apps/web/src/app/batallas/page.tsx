import { getRecentBattles, parseBattleWords } from "@/lib/data";
import { AppNav } from "@/components/AppNav";
import { MODALITIES, modalityIdSchema } from "@rap/shared";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BattlesPage() {
	const battles = await getRecentBattles(50);

	return (
		<main className="app-page-shell">
			<AppNav status="HISTORIAL GLOBAL" />
			<div className="hx-shell">
				<header className="hx-head">
					<p className="hx-kicker">LO QUE PASÓ EN EL CUADRILÁTERO</p>
					<h1 className="hx-title">
						BATA<em>LLAS</em>
					</h1>
				</header>

				{battles.length === 0 ? (
					<section className="hx-empty">
						<p>TODAVÍA NO HAY HISTORIAL</p>
						<Link href="/arena" className="btn-arena" style={{ padding: "14px 36px", fontSize: 18 }}>
							<span>ABRÍ LA CUENTA →</span>
						</Link>
					</section>
				) : (
					<section className="hx-list">
						{battles.map((battle) => {
							const words = parseBattleWords(battle);
							const modality = modalityIdSchema.safeParse(battle.modality);
							const modName = modality.success ? MODALITIES[modality.data].name : battle.modality;
							const finished = battle.status === "finished" && battle.winner;
							const aborted = battle.status === "aborted";
							// Solo una batalla finalizada tiene ganador/score: mientras está
							// EN CURSO no mostramos veredicto ni puntaje (evita "EN CURSO" con GANÓ).
							const winnerName =
								!finished || battle.winner === "draw"
									? null
									: battle.winner === "p1"
										? battle.player1Name
										: battle.player2Name;

							return (
								<article key={battle.id} className={`hx-card${aborted ? " aborted" : ""}`}>
									<div className="hx-card-top">
										<span className="hx-mod">{modName.toUpperCase()}</span>
										{battle.beatName && <span className="hx-beat">♪ {battle.beatName.toUpperCase()}</span>}
										<span className={`hx-stamp${finished ? (battle.winner === "draw" ? " draw" : " win") : aborted ? " off" : " live"}`}>
											{finished ? (battle.winner === "draw" ? "EMPATE" : "FINALIZADA") : aborted ? "ABANDONADA" : "EN CURSO"}
										</span>
									</div>
									<div className="hx-card-main">
										<span className={`hx-name${finished && battle.winner === "p1" ? " winner" : ""}`}>
											{battle.player1Name.toUpperCase()}
										</span>
										<span className="hx-score">
											{finished ? (battle.scoreP1 ?? "–") : "–"}
											<i>/</i>
											{finished ? (battle.scoreP2 ?? "–") : "–"}
										</span>
										<span className={`hx-name right${finished && battle.winner === "p2" ? " winner" : ""}`}>
											{battle.player2Name.toUpperCase()}
										</span>
									</div>
									<div className="hx-card-bottom">
										{winnerName && battle.winner !== "draw" && (
											<span className="hx-verdict">
												GANÓ <b>{winnerName.toUpperCase()}</b>
											</span>
										)}
										{words.map((word) => (
											<span key={word} className="hx-word">
												{word}
											</span>
										))}
										{battle.endedAt && (
											<span className="hx-date">
												{new Date(battle.endedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
											</span>
										)}
									</div>
								</article>
							);
						})}
					</section>
				)}
			</div>
		</main>
	);
}
