import { getRanking } from "@/lib/data";
import { AppNav } from "@/components/AppNav";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
	const ranking = await getRanking(50);

	return (
		<main className="app-page-shell">
			<AppNav status="RANKING GLOBAL" />
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
				<h1 className="page-title">Ranking</h1>
				<section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
					{ranking.length === 0 ? (
						<EmptyState text="Todavía no hay batallas rankeadas. Jugá una arena para inaugurar la tabla." />
					) : (
						<table className="w-full text-left text-sm">
							<thead className="bg-white/[0.06] text-xs uppercase text-white/45">
								<tr>
									<th className="px-4 py-3">#</th>
									<th className="px-4 py-3">MC</th>
									<th className="px-4 py-3 text-right">ELO</th>
									<th className="px-4 py-3 text-right">W-E-D</th>
									<th className="px-4 py-3 text-right">Win%</th>
									<th className="px-4 py-3 text-right">Racha</th>
								</tr>
							</thead>
							<tbody>
								{ranking.map((mc, index) => {
									const wr = mc.battles > 0 ? Math.round((mc.wins / mc.battles) * 100) : 0;
									return (
										<tr key={mc.id} className="border-t border-white/8">
											<td className="px-4 py-3 text-white/35">{index + 1}</td>
											<td className="px-4 py-3 font-bold">
												<Link className="hover:text-fuchsia-300" href={`/perfil/${encodeURIComponent(mc.id)}`}>
													{mc.handle}
												</Link>
											</td>
											<td className="px-4 py-3 text-right font-mono text-cyan-200">{mc.elo}</td>
											<td className="px-4 py-3 text-right text-white/55 font-mono">
												{mc.wins}-{mc.draws}-{mc.losses}
											</td>
											<td className={`px-4 py-3 text-right font-mono ${wr >= 50 ? "text-green-400" : "text-red-400/70"}`}>
												{wr}%
											</td>
											<td className="px-4 py-3 text-right font-mono text-yellow-300/80">
												{mc.currentStreak > 0 ? `🔥 ${mc.currentStreak}` : mc.currentStreak === 0 && mc.bestStreak > 0 ? `—` : "—"}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</section>
			</div>
		</main>
	);
}

function EmptyState({ text }: { text: string }) {
	return <p className="px-5 py-10 text-center text-sm text-white/45">{text}</p>;
}
