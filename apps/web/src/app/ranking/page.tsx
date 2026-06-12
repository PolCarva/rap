import { getRanking } from "@/lib/data";
import { AppNav } from "@/components/AppNav";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PODIUM_TAGS = ["CAMPEÓN", "RETADOR", "AMENAZA"] as const;

export default async function RankingPage() {
	const ranking = await getRanking(50);
	const podium = ranking.slice(0, 3);
	const rest = ranking.slice(3);

	return (
		<main className="app-page-shell">
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
										href={`/perfil/${encodeURIComponent(mc.id)}`}
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
										<Link key={mc.id} href={`/perfil/${encodeURIComponent(mc.id)}`} className="rk-row">
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
