import { getRecentBattles, parseBattleWords } from "@/lib/data";
import { AppNav } from "@/components/AppNav";
import { absoluteUrl, breadcrumbJsonLd, createPageMetadata, jsonLd, SITE_NAME } from "@/lib/seo";
import { MODALITIES, modalityIdSchema } from "@rap/shared";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
	title: "Historial de batallas de rap",
	description:
		"Revisá las últimas batallas de freestyle en Rapear Online: resultados, scores, modos, beats y veredictos del juez IA.",
	path: "/batallas",
	image: "/og-batallas.png",
	keywords: ["historial freestyle", "resultados batallas de rap", "veredictos freestyle", "batallas recientes"],
});

export default async function BattlesPage() {
	const battles = await getRecentBattles(50);

	return (
		<main className="app-page-shell">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: jsonLd([
						{
							"@context": "https://schema.org",
							"@type": "CollectionPage",
							"@id": absoluteUrl("/batallas#webpage"),
							url: absoluteUrl("/batallas"),
							name: "Historial de batallas de rap",
							description: "Resultados recientes de batallas de freestyle online en Rapear Online.",
							isPartOf: { "@id": absoluteUrl("/#website") },
							mainEntity: {
								"@type": "ItemList",
								itemListElement: battles.slice(0, 20).map((battle, index) => ({
									"@type": "ListItem",
									position: index + 1,
									name: `${battle.player1Name} vs ${battle.player2Name}`,
									url: absoluteUrl(`/batallas/${encodeURIComponent(battle.id)}`),
								})),
							},
						},
						breadcrumbJsonLd([
							{ name: SITE_NAME, path: "/" },
							{ name: "Batallas", path: "/batallas" },
						]),
					]),
				}}
			/>
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
								<Link
									key={battle.id}
									href={`/batallas/${encodeURIComponent(battle.id)}`}
									className={`hx-card${aborted ? " aborted" : ""}`}
									aria-label={`Ver detalle de ${battle.player1Name} vs ${battle.player2Name}`}
								>
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
								</Link>
							);
						})}
					</section>
				)}
			</div>
		</main>
	);
}
