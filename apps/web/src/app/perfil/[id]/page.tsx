import { getPublicProfile, getUserBattles, getUserModalityStats } from "@/lib/data";
import { getCurrentUser } from "@/lib/server-auth";
import { AppNav } from "@/components/AppNav";
import { ProfileEditor } from "@/components/ProfileEditor";
import { AvatarEditor } from "@/components/avatar/AvatarEditor";
import { RapperAvatar } from "@/components/avatar/RapperAvatar";
import { absoluteUrl, breadcrumbJsonLd, createPageMetadata, jsonLd, SITE_NAME } from "@/lib/seo";
import { MODALITIES, avatarFromSeed, modalityIdSchema, parseAvatarConfig } from "@rap/shared";

export const dynamic = "force-dynamic";

type ProfileParams = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: ProfileParams }) {
	const { id } = await params;
	const decodedId = decodeURIComponent(id);

	if (decodedId === "me") {
		return createPageMetadata({
			title: "Mi perfil",
			description: "Perfil personal de Rap Arena.",
			path: "/perfil/me",
			image: "/og-profile.png",
			noIndex: true,
		});
	}

	const profile = await getPublicProfile(decodedId);
	if (!profile) {
		return createPageMetadata({
			title: "Perfil no encontrado",
			description: "Este perfil de Rap Arena no existe o ya no está disponible.",
			path: `/perfil/${encodeURIComponent(decodedId)}`,
			image: "/og-profile.png",
			noIndex: true,
		});
	}

	const winRate = profile.battles > 0 ? Math.round((profile.wins / profile.battles) * 100) : 0;
	return createPageMetadata({
		title: `${profile.handle} - perfil freestyle`,
		description: `Stats de ${profile.handle} en Rap Arena: ${profile.elo} ELO, ${profile.battles} batallas, ${profile.wins} victorias y ${winRate}% win rate.`,
		path: `/perfil/${encodeURIComponent(profile.handle)}`,
		image: "/og-profile.png",
		imageAlt: `Perfil de ${profile.handle} en Rap Arena`,
		keywords: [profile.handle, "perfil MC", "stats freestyle", "ELO rap"],
	});
}

export default async function ProfilePage({ params }: { params: ProfileParams }) {
	const { id } = await params;
	const decodedId = decodeURIComponent(id);
	const currentUser = await getCurrentUser();
	const lookupId = decodedId === "me" ? currentUser?.id ?? "" : decodedId;
	const profile = lookupId ? await getPublicProfile(lookupId) : null;

	if (!profile) {
		return (
			<PageShell>
				<section className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-10 text-center text-sm text-white/45">
					Perfil no encontrado o inicia sesión para ver tu perfil.
				</section>
			</PageShell>
		);
	}

	const [battles, modalityStats] = await Promise.all([
		getUserBattles(profile.id, 30),
		getUserModalityStats(profile.id),
	]);
	const isOwnProfile = currentUser?.id === profile.id;
	const winRate = profile.battles > 0 ? Math.round((profile.wins / profile.battles) * 100) : 0;
	const avatar = profile.avatarConfig ? parseAvatarConfig(profile.avatarConfig) : avatarFromSeed(profile.id);
	const profilePath = `/perfil/${encodeURIComponent(profile.handle)}`;

	// Preferred modality = most battles played
	const preferredModality = modalityStats[0] ?? null;

	// Best modality = highest win rate (min 3 battles)
	const bestModality = modalityStats
		.filter((s) => s.battles >= 3)
		.sort((a, b) => b.wins / b.battles - a.wins / a.battles)[0] ?? null;

	// Average score per modality
	const modalityWithAvg = modalityStats.map((s) => ({
		...s,
		avgScore: s.battles > 0 ? s.totalScore / s.battles : 0,
	}));

	return (
		<PageShell>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: jsonLd([
						{
							"@context": "https://schema.org",
							"@type": "ProfilePage",
							"@id": absoluteUrl(`${profilePath}#webpage`),
							url: absoluteUrl(profilePath),
							name: `${profile.handle} en Rap Arena`,
							description: `Perfil freestyle de ${profile.handle}: ${profile.elo} ELO y ${profile.battles} batallas.`,
							isPartOf: { "@id": absoluteUrl("/#website") },
							mainEntity: {
								"@type": "Person",
								"@id": absoluteUrl(`${profilePath}#person`),
								name: profile.handle,
								identifier: profile.id,
								additionalProperty: [
									{ "@type": "PropertyValue", name: "ELO", value: profile.elo },
									{ "@type": "PropertyValue", name: "Batallas", value: profile.battles },
									{ "@type": "PropertyValue", name: "Victorias", value: profile.wins },
									{ "@type": "PropertyValue", name: "Win rate", value: `${winRate}%` },
								],
							},
						},
						breadcrumbJsonLd([
							{ name: SITE_NAME, path: "/" },
							{ name: "Ranking", path: "/ranking" },
							{ name: profile.handle, path: profilePath },
						]),
					]),
				}}
			/>
			{/* Hero card */}
			<section
				style={{
					border: "1px solid rgba(255,255,255,0.08)",
					background: "rgba(255,255,255,0.02)",
					padding: "28px 24px",
				}}
			>
				<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
					<div className="profile-identity">
						<RapperAvatar config={avatar} size={120} title={`Avatar de ${profile.handle}`} />
						<div>
							<p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: profile.isGuest ? "rgba(163,230,53,0.7)" : "rgba(232,25,44,0.85)", marginBottom: 6 }}>
								{profile.isGuest ? "Invitado" : "MC Registrado"}
							</p>
							<h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, letterSpacing: "0.02em", lineHeight: 1 }}>
								{profile.handle.toUpperCase()}
							</h1>
							{profile.email && (
								<p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
									{profile.email}
								</p>
							)}
						</div>
					</div>
					<div style={{ textAlign: "right" }}>
						<p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.2em" }}>
							MIEMBRO DESDE
						</p>
						<p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
							{new Date(profile.createdAt).toLocaleDateString("es-ES", { month: "short", year: "numeric" })}
						</p>
					</div>
				</div>

				{/* Main stats grid */}
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12, marginTop: 24 }}>
					<StatCard label="ELO" value={profile.elo} accent="cyan" />
					<StatCard label="Batallas" value={profile.battles} />
					<StatCard label="Victorias" value={profile.wins} accent="green" />
					<StatCard label="Derrotas" value={profile.losses} accent="red" />
					<StatCard label="Empates" value={profile.draws} />
					<StatCard label="Win Rate" value={`${winRate}%`} accent={winRate >= 50 ? "green" : "red"} />
				</div>
			</section>

			{isOwnProfile && <ProfileEditor handle={profile.handle} />}
			{isOwnProfile && !profile.isGuest && <AvatarEditor initial={avatar} seed={profile.id} />}

			{/* Streak + records */}
			<section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
				<StreakCard
					label="Racha actual"
					value={profile.currentStreak}
					result={profile.lastBattleResult}
				/>
				<StreakCard label="Mejor racha" value={profile.bestStreak} highlight />
				{preferredModality && (
					<InfoCard
						label="Modo preferido"
						value={modalityIdSchema.safeParse(preferredModality.modality).success
							? MODALITIES[modalityIdSchema.parse(preferredModality.modality)].name
							: preferredModality.modality}
						sub={`${preferredModality.battles} batallas`}
					/>
				)}
				{bestModality && (
					<InfoCard
						label="Mejor modo"
						value={modalityIdSchema.safeParse(bestModality.modality).success
							? MODALITIES[modalityIdSchema.parse(bestModality.modality)].name
							: bestModality.modality}
						sub={`${Math.round((bestModality.wins / bestModality.battles) * 100)}% win rate`}
						accent="green"
					/>
				)}
			</section>

			{/* Modality breakdown */}
			{modalityWithAvg.length > 0 && (
				<section style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
					<div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
						<h2 style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
							Stats por Modo
						</h2>
					</div>
					<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
						<thead>
							<tr style={{ background: "rgba(255,255,255,0.04)" }}>
								{["Modo", "Batallas", "V-E-D", "Win %", "Score Prom."].map((h) => (
									<th key={h} style={{ padding: "10px 16px", textAlign: h === "Modo" ? "left" : "right", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{modalityWithAvg.map((s) => {
								const mId = modalityIdSchema.safeParse(s.modality);
								const mName = mId.success ? MODALITIES[mId.data].name : s.modality;
								const wr = s.battles > 0 ? Math.round((s.wins / s.battles) * 100) : 0;
								return (
									<tr key={s.modality} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
										<td style={{ padding: "10px 16px", fontWeight: 700 }}>{mName}</td>
										<td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.6)" }}>{s.battles}</td>
										<td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.6)" }}>
											{s.wins}-{s.draws}-{s.losses}
										</td>
										<td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: wr >= 50 ? "rgba(34,197,94,0.85)" : "rgba(232,25,44,0.75)" }}>
											{wr}%
										</td>
										<td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "rgba(165,243,252,0.75)" }}>
											{s.avgScore.toFixed(1)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</section>
			)}

			{/* Battle history */}
			{battles.length > 0 && (
				<section style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
					<div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
						<h2 style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
							Historial de Batallas
						</h2>
					</div>
					<div style={{ display: "flex", flexDirection: "column" }}>
						{battles.map((b, i) => {
							const isP1 = b.player1Id === profile.id;
							const myScore = isP1 ? b.scoreP1 : b.scoreP2;
							const oppScore = isP1 ? b.scoreP2 : b.scoreP1;
							const oppName = isP1 ? b.player2Name : b.player1Name;
							const myRole = isP1 ? "p1" : "p2";
							const result = b.winner === "draw" ? "draw" : b.winner === myRole ? "win" : "loss";
							const mId = modalityIdSchema.safeParse(b.modality);
							const mName = mId.success ? MODALITIES[mId.data].name : b.modality;
							const resultLabel = result === "win" ? "VICTORIA" : result === "loss" ? "DERROTA" : "EMPATE";
							const resultColor = result === "win" ? "rgba(34,197,94,0.85)" : result === "loss" ? "rgba(232,25,44,0.75)" : "rgba(255,255,255,0.5)";

							return (
								<div
									key={b.id}
									style={{
										padding: "14px 20px",
										borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
										display: "flex",
										alignItems: "center",
										gap: 16,
										flexWrap: "wrap",
									}}
								>
									<div
										style={{
											minWidth: 70,
											fontFamily: "var(--font-mono)",
											fontSize: 11,
											fontWeight: 700,
											letterSpacing: "0.15em",
											color: resultColor,
										}}
									>
										{resultLabel}
									</div>
									<div style={{ flex: 1 }}>
										<p style={{ fontWeight: 700, fontSize: 14 }}>
											vs <span style={{ color: "rgba(165,243,252,0.85)" }}>{oppName}</span>
										</p>
										<p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
											{mName}
										</p>
									</div>
									<div style={{ textAlign: "right" }}>
										<p style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "rgba(165,243,252,0.75)" }}>
											{myScore?.toFixed(1) ?? "-"} <span style={{ color: "rgba(255,255,255,0.25)" }}>vs</span> {oppScore?.toFixed(1) ?? "-"}
										</p>
										{b.endedAt && (
											<p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
												{new Date(b.endedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
											</p>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</section>
			)}

			{battles.length === 0 && profile.battles === 0 && (
				<section style={{ padding: "40px 20px", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.2em" }}>
					AÚN NO HAY BATALLAS REGISTRADAS
				</section>
			)}
		</PageShell>
	);
}

function PageShell({ children }: { children: React.ReactNode }) {
	return (
		<main className="app-page-shell">
			<AppNav status="PERFIL" />
			<div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
				{children}
			</div>
		</main>
	);
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: "cyan" | "green" | "red" }) {
	const colors = {
		cyan: "rgba(165,243,252,0.9)",
		green: "rgba(34,197,94,0.85)",
		red: "rgba(232,25,44,0.8)",
		default: "rgba(255,255,255,0.85)",
	};
	const color = colors[accent ?? "default"];
	return (
		<div style={{ padding: "14px 16px", border: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}>
			<p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
				{label}
			</p>
			<p style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 900, color, marginTop: 4, lineHeight: 1 }}>
				{value}
			</p>
		</div>
	);
}

function StreakCard({ label, value, result, highlight }: { label: string; value: number; result?: string | null; highlight?: boolean }) {
	const icon = result === "win" ? "🔥" : result === "loss" ? "💀" : result === "draw" ? "🤝" : "";
	return (
		<div style={{ padding: "16px 20px", border: `1px solid ${highlight && value > 0 ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.07)"}`, background: highlight && value > 0 ? "rgba(234,179,8,0.05)" : "rgba(0,0,0,0.2)" }}>
			<p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
				{label}
			</p>
			<p style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 900, color: value > 2 ? "rgba(234,179,8,0.9)" : "rgba(255,255,255,0.85)", marginTop: 4, lineHeight: 1 }}>
				{value} {icon}
			</p>
		</div>
	);
}

function InfoCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "green" }) {
	return (
		<div style={{ padding: "16px 20px", border: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}>
			<p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
				{label}
			</p>
			<p style={{ fontWeight: 800, fontSize: 16, marginTop: 6, color: accent === "green" ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.85)" }}>
				{value}
			</p>
			{sub && (
				<p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
					{sub}
				</p>
			)}
		</div>
	);
}
