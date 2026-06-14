import { AppNav } from "@/components/AppNav";
import { getBattleDetail, parseBattleWords } from "@/lib/data";
import { absoluteUrl, breadcrumbJsonLd, createPageMetadata, jsonLd, SITE_NAME } from "@/lib/seo";
import {
	CRITERIA,
	CRITERIA_LABELS,
	MODALITIES,
	modalityIdSchema,
	type JudgeVote,
	type PlayerVerdict,
	type Role,
} from "@rap/shared";
import Link from "next/link";

export const dynamic = "force-dynamic";

type BattleDetailParams = Promise<{ id: string }>;
type VerdictPair = { p1: PlayerVerdict; p2: PlayerVerdict };

interface ParsedStoredJudgment {
	players: VerdictPair | null;
	judges: JudgeVote[];
}

export async function generateMetadata({ params }: { params: BattleDetailParams }) {
	const { id } = await params;
	const decodedId = decodeURIComponent(id);
	const detail = await getBattleDetail(decodedId);

	if (!detail) {
		return createPageMetadata({
			title: "Batalla no encontrada",
			description: "Esta batalla no existe o todavia no tiene detalle disponible.",
			path: `/batallas/${encodeURIComponent(decodedId)}`,
			image: "/og-batallas.png",
			noIndex: true,
		});
	}

	const battle = detail.battle;
	return createPageMetadata({
		title: `${battle.player1Name} vs ${battle.player2Name}`,
		description: `Transcript y resultado de la batalla entre ${battle.player1Name} y ${battle.player2Name} en Rapear Online.`,
		path: `/batallas/${encodeURIComponent(battle.id)}`,
		image: "/og-batallas.png",
		keywords: ["transcript freestyle", "batalla de rap", battle.player1Name, battle.player2Name],
	});
}

export default async function BattleDetailPage({ params }: { params: BattleDetailParams }) {
	const { id } = await params;
	const decodedId = decodeURIComponent(id);
	const detail = await getBattleDetail(decodedId);

	if (!detail) {
		return (
			<PageShell>
				<section className="bd-empty">
					<p>BATALLA NO ENCONTRADA</p>
					<Link href="/batallas" className="btn-ghost">
						VOLVER AL HISTORIAL
					</Link>
				</section>
			</PageShell>
		);
	}

	const { battle, turns, judgment } = detail;
	const words = parseBattleWords(battle);
	const modality = modalityIdSchema.safeParse(battle.modality);
	const modName = modality.success ? MODALITIES[modality.data].name : battle.modality;
	const finished = (battle.status === "finished" || battle.winner !== null) && battle.winner !== null;
	const aborted = battle.status === "aborted";
	const winnerName =
		!finished || battle.winner === "draw"
			? null
			: battle.winner === "p1"
				? battle.player1Name
				: battle.player2Name;
	const statusLabel = finished ? (battle.winner === "draw" ? "EMPATE" : `GANÓ ${winnerName}`) : aborted ? "ABANDONADA" : "EN CURSO";
	const parsedJudgment = parseStoredJudgment(judgment?.detail ?? null);
	const rounds = transcriptRounds(turns);
	const detailPath = `/batallas/${encodeURIComponent(battle.id)}`;

	return (
		<PageShell>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: jsonLd([
						{
							"@context": "https://schema.org",
							"@type": "Article",
							"@id": absoluteUrl(`${detailPath}#webpage`),
							url: absoluteUrl(detailPath),
							name: `${battle.player1Name} vs ${battle.player2Name}`,
							description: `Resultado y transcript de ${battle.player1Name} vs ${battle.player2Name}.`,
							isPartOf: { "@id": absoluteUrl("/#website") },
						},
						breadcrumbJsonLd([
							{ name: SITE_NAME, path: "/" },
							{ name: "Batallas", path: "/batallas" },
							{ name: `${battle.player1Name} vs ${battle.player2Name}`, path: detailPath },
						]),
					]),
				}}
			/>
			<div className="bd-shell">
				<Link href="/batallas" className="bd-back">
					← HISTORIAL
				</Link>

				<header className="bd-hero">
					<div className="bd-meta">
						<span>{modName.toUpperCase()}</span>
						{battle.beatName && <span>BEAT: {battle.beatName.toUpperCase()}</span>}
						<span className={finished && battle.winner !== "draw" ? "bd-status win" : aborted ? "bd-status off" : "bd-status"}>
							{statusLabel}
						</span>
					</div>
					<div className="bd-match">
						<PlayerName name={battle.player1Name} userId={battle.player1Id} winner={battle.winner === "p1"} />
						<div className="bd-score">
							{formatScore(battle.scoreP1)}
							<i>/</i>
							{formatScore(battle.scoreP2)}
						</div>
						<PlayerName name={battle.player2Name} userId={battle.player2Id} winner={battle.winner === "p2"} align="right" />
					</div>
					<div className="bd-subline">
						{battle.endedAt ? (
							<span>{formatDate(battle.endedAt)}</span>
						) : battle.startedAt ? (
							<span>INICIADA {formatDate(battle.startedAt)}</span>
						) : null}
						{words.map((word) => (
							<span key={word} className="hx-word">
								{word}
							</span>
						))}
					</div>
				</header>

				<section className="bd-section">
					<div className="bd-section-head">
						<p>TRANSCRIPT</p>
						<span>{rounds.length} RONDAS REGISTRADAS</span>
					</div>
					<div className="bd-rounds">
						{rounds.length > 0 ? (
							rounds.map((round) => (
								<div key={round} className="bd-round">
									<div className="bd-round-label">RONDA {round}</div>
									<TranscriptCell
										name={battle.player1Name}
										role="p1"
										text={turns.find((turn) => turn.round === round && turn.role === "p1")?.transcript ?? ""}
									/>
									<TranscriptCell
										name={battle.player2Name}
										role="p2"
										text={turns.find((turn) => turn.round === round && turn.role === "p2")?.transcript ?? ""}
									/>
								</div>
							))
						) : (
							<div className="bd-no-transcript">NO HAY TRANSCRIPT GUARDADO PARA ESTA BATALLA</div>
						)}
					</div>
				</section>

				<section className="bd-section">
					<div className="bd-section-head">
						<p>RESULTADOS</p>
						{judgment?.model && <span>{judgment.model.toUpperCase()}</span>}
					</div>
					{parsedJudgment.players ? (
						<div className="bd-score-grid">
							<PlayerScore
								name={battle.player1Name}
								total={judgment?.scoreP1 ?? battle.scoreP1 ?? 0}
								pv={parsedJudgment.players.p1}
								highlight={battle.winner === "p1"}
							/>
							<PlayerScore
								name={battle.player2Name}
								total={judgment?.scoreP2 ?? battle.scoreP2 ?? 0}
								pv={parsedJudgment.players.p2}
								highlight={battle.winner === "p2"}
							/>
						</div>
					) : (
						<div className="bd-score-fallback">
							<span>{battle.player1Name}: {formatScore(battle.scoreP1)}</span>
							<span>{battle.player2Name}: {formatScore(battle.scoreP2)}</span>
						</div>
					)}
					{parsedJudgment.judges.length > 0 && (
						<div className="bd-judge-votes">
							{parsedJudgment.judges.map((judge) => (
								<span key={judge.judge}>
									J{judge.judge}: {judge.vote === "replica" ? "RÉPLICA" : roleLabel(judge.vote, battle.player1Name, battle.player2Name)}
								</span>
							))}
						</div>
					)}
					{judgment?.rationale && (
						<div className="bd-rationale">
							<span>EL JURADO</span>
							{judgment.rationale}
						</div>
					)}
				</section>
			</div>
		</PageShell>
	);
}

function PageShell({ children }: { children: React.ReactNode }) {
	return (
		<main className="app-page-shell">
			<AppNav status="DETALLE" />
			{children}
		</main>
	);
}

function PlayerName({
	name,
	userId,
	winner,
	align,
}: {
	name: string;
	userId: string | null;
	winner: boolean;
	align?: "right";
}) {
	const className = `bd-player${winner ? " winner" : ""}${align === "right" ? " right" : ""}`;
	const label = name.toUpperCase();
	if (!userId) return <span className={className}>{label}</span>;
	return (
		<Link href={`/perfil/${encodeURIComponent(userId)}`} className={className}>
			{label}
		</Link>
	);
}

function TranscriptCell({ name, role, text }: { name: string; role: Role; text: string }) {
	const clean = text.trim();
	return (
		<div className={`bd-transcript-cell ${role}`}>
			<div className="bd-transcript-name">{name}</div>
			<p>{clean || "Sin transcript registrado."}</p>
		</div>
	);
}

function PlayerScore({
	name,
	total,
	pv,
	highlight,
}: {
	name: string;
	total: number;
	pv: PlayerVerdict;
	highlight: boolean;
}) {
	return (
		<div className={`result-score-card${highlight ? " winner" : ""}`}>
			<div className={`crit-head${highlight ? " hl" : ""}`}>
				<span className="crit-name">{name}</span>
				<span className="crit-total">{formatScore(total)}</span>
			</div>
			<div className="crit-list">
				{CRITERIA.map((criterion) => {
					const value = pv.criteria[criterion];
					return (
						<div key={criterion} className="crit-row">
							<span className="crit-label">{CRITERIA_LABELS[criterion]}</span>
							{value === null ? (
								<span className="crit-na">-</span>
							) : (
								<>
									<div className="crit-bar">
										<span style={{ width: `${value * 10}%` }} />
									</div>
									<span className="crit-val">{value}</span>
								</>
							)}
						</div>
					);
				})}
			</div>
			{pv.comment && <p className="crit-comment">{pv.comment}</p>}
		</div>
	);
}

function parseStoredJudgment(raw: string | null): ParsedStoredJudgment {
	if (!raw) return { players: null, judges: [] };
	try {
		const root = JSON.parse(raw) as unknown;
		if (!isRecord(root)) return { players: null, judges: [] };
		const detail = isRecord(root.detail) ? root.detail : null;
		const playerCandidates = [detail?.players, detail, root.players, root.detail];
		const players = playerCandidates.map(verdictPair).find(Boolean) ?? null;
		const judgeCandidates = [detail?.judges, root.judges];
		const judges = judgeCandidates.flatMap((candidate) =>
			Array.isArray(candidate) ? candidate.filter(isJudgeVote) : [],
		);
		return { players, judges };
	} catch {
		return { players: null, judges: [] };
	}
}

function transcriptRounds(turns: { round: number }[]): number[] {
	return Array.from(new Set(turns.map((turn) => turn.round))).sort((a, b) => a - b);
}

function verdictPair(value: unknown): VerdictPair | null {
	if (!isRecord(value) || !isRecord(value.p1) || !isRecord(value.p2)) return null;
	return value as VerdictPair;
}

function isJudgeVote(value: unknown): value is JudgeVote {
	return (
		isRecord(value) &&
		typeof value.judge === "number" &&
		(value.vote === "p1" || value.vote === "p2" || value.vote === "replica")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function roleLabel(role: Role, p1Name: string, p2Name: string): string {
	return role === "p1" ? p1Name.toUpperCase() : p2Name.toUpperCase();
}

function formatScore(value: number | null): string {
	return typeof value === "number" ? value.toFixed(1) : "-";
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("es-ES", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}
