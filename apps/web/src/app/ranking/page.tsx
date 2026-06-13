import { getRanking } from "@/lib/data";
import { AppNav } from "@/components/AppNav";
import { absoluteUrl, breadcrumbJsonLd, createPageMetadata, jsonLd, SITE_NAME } from "@/lib/seo";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
	title: "Ranking ELO de freestyle",
	description:
		"Consultá el ranking global de Rap Arena con ELO, victorias, derrotas, win rate y rachas de los MCs de freestyle online.",
	path: "/ranking",
	image: "/og-ranking.png",
	keywords: ["ranking freestyle", "ranking ELO rap", "tabla de MCs", "mejores MCs online"],
});

const PODIUM_TAGS = ["CAMPEÓN", "RETADOR", "AMENAZA"] as const;

export default async function RankingPage() {
	const ranking = await getRanking(50);
	const podium = ranking.slice(0, 3);
	const rest = ranking.slice(3);

	return (
		<main className="app-page-shell">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: jsonLd([
						{
							"@context": "https://schema.org",
							"@type": "CollectionPage",
							"@id": absoluteUrl("/ranking#webpage"),
							url: absoluteUrl("/ranking"),
							name: "Ranking ELO de freestyle",
							description: "Tabla global de MCs de Rap Arena con ELO, victorias y rachas.",
							isPartOf: { "@id": absoluteUrl("/#website") },
							mainEntity: {
								"@type": "ItemList",
								itemListElement: ranking.slice(0, 20).map((mc, index) => ({
									"@type": "ListItem",
									position: index + 1,
									name: mc.handle,
									url: absoluteUrl(`/perfil/${encodeURIComponent(mc.handle)}`),
								})),
							},
						},
						breadcrumbJsonLd([
							{ name: SITE_NAME, path: "/" },
							{ name: "Ranking", path: "/ranking" },
						]),
					]),
				}}
			/>
			<AppNav status="RANKING GLOBAL" />
			<div className="rk-shell">
				<header className="rk-head">
					<p className="rk-kicker">LA TABLA NO MIENTE</p>
					<h1 className="rk-title">
						RANK<em>ING</em>
					</h1>
				</header>

				{ranking.length === 0 ? (
					<section className="rk-empty">
						<p>TODAVÍA NO HAY BATALLAS RANKEADAS</p>
						<Link href="/arena" className="btn-arena" style={{ padding: "14px 36px", fontSize: 18 }}>
							<span>INAUGURÁ LA TABLA →</span>
						</Link>
					</section>
				) : (
					<>
						{/* Podio top 3 */}
						<section className="rk-podium">
							{podium.map((mc, index) => {
								const wr = mc.battles > 0 ? Math.round((mc.wins / mc.battles) * 100) : 0;
								return (
									<Link
										key={mc.id}
										href={`/perfil/${encodeURIComponent(mc.handle)}`}
										className={`rk-podium-card pos-${index + 1}`}
									>
										<span className="rk-podium-rank">{String(index + 1).padStart(2, "0")}</span>
										<span className="rk-podium-tag">{PODIUM_TAGS[index]}</span>
										<span className="rk-podium-handle">{mc.handle.toUpperCase()}</span>
										<span className="rk-podium-elo">
											{mc.elo}
											<small>ELO</small>
										</span>
										<span className="rk-podium-meta">
											{mc.wins}V · {mc.losses}D · {wr}% WIN
											{mc.currentStreak > 1 ? ` · 🔥${mc.currentStreak}` : ""}
										</span>
									</Link>
								);
							})}
						</section>

						{/* Tabla del resto */}
						{rest.length > 0 && (
							<section className="rk-table">
								<div className="rk-row rk-row-head">
									<span>#</span>
									<span>MC</span>
									<span className="num">ELO</span>
									<span className="num">V-E-D</span>
									<span className="num">WIN%</span>
									<span className="num">RACHA</span>
								</div>
								{rest.map((mc, index) => {
									const wr = mc.battles > 0 ? Math.round((mc.wins / mc.battles) * 100) : 0;
									return (
										<Link key={mc.id} href={`/perfil/${encodeURIComponent(mc.handle)}`} className="rk-row">
											<span className="rk-pos">{String(index + 4).padStart(2, "0")}</span>
											<span className="rk-handle">{mc.handle.toUpperCase()}</span>
											<span className="num rk-elo">{mc.elo}</span>
											<span className="num rk-record">
												{mc.wins}-{mc.draws}-{mc.losses}
											</span>
											<span className={`num ${wr >= 50 ? "rk-up" : "rk-down"}`}>{wr}%</span>
											<span className="num rk-streak">{mc.currentStreak > 1 ? `🔥 ${mc.currentStreak}` : "—"}</span>
										</Link>
									);
								})}
							</section>
						)}
					</>
				)}
			</div>
		</main>
	);
}
