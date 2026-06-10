"use client";

import {
	CRITERIA,
	CRITERIA_LABELS,
	MODALITIES,
	type BattleState,
	type PlayerVerdict,
	type RtcSignal,
	type Role,
} from "@rap/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { CrowdReactions } from "@/components/CrowdReactions";
import { PlayerPanel } from "./PlayerPanel";
import { useChunkedTranscription } from "./useChunkedTranscription";
import { useDeepgramTranscription } from "./useDeepgramTranscription";
import type { MediaController } from "./useMediaStream";
import { useWebRtcPeer } from "./useWebRtcPeer";

interface Props {
	battle: BattleState;
	myRole: Role;
	opponentCaption: string;
	media: MediaController;
	incomingSignal: { role: Role; signal: RtcSignal; seq: number } | null;
	reconnecting?: boolean;
	onReady: () => void;
	onCaption: (text: string) => void;
	onSignal: (signal: RtcSignal) => void;
	onSubmitVerse: (text: string) => void;
	onLeave: () => void;
}

function useRemaining(deadline: number | null): number | null {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (deadline === null) return;
		const id = setInterval(() => setNow(Date.now()), 200);
		return () => clearInterval(id);
	}, [deadline]);
	if (deadline === null) return null;
	return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function BattleStage({
	battle,
	myRole,
	opponentCaption,
	media,
	incomingSignal,
	reconnecting,
	onReady,
	onCaption,
	onSignal,
	onSubmitVerse,
	onLeave,
}: Props) {
	const oppRole: Role = myRole === "p1" ? "p2" : "p1";
	const me = battle.players[myRole];
	const opp = battle.players[oppRole];
	const isMyTurn = battle.phase === "turn" && battle.activeRole === myRole;
	const remaining = useRemaining(battle.deadline);

	const {
		supported: dgSupported,
		secure: dgSecure,
		listening: dgListening,
		error: dgError,
		transcript: dgTranscript,
		interim: dgInterim,
		start: dgStart,
		stop: dgStop,
	} = useDeepgramTranscription();
	const {
		supported: chunkSupported,
		secure: chunkSecure,
		listening: chunkListening,
		error: chunkError,
		transcript: chunkTranscript,
		start: chunkStart,
		stop: chunkStop,
	} = useChunkedTranscription();

	const { ensureActive, stream } = media;
	const [draft, setDraft] = useState("");
	const [useChunkFallback, setUseChunkFallback] = useState(false);
	const [beatBlocked, setBeatBlocked] = useState(false);
	const handledTurn = useRef<string | null>(null);
	const submittedTurn = useRef<string | null>(null);
	const beatAudioRef = useRef<HTMLAudioElement | null>(null);
	const localStream = stream.current;
	const mediaEnabled =
		!!localStream && battle.phase !== "lobby" && battle.phase !== "aborted" && battle.phase !== "result";
	const { remoteStream, status: peerStatus } = useWebRtcPeer({
		enabled: mediaEnabled,
		initiator: myRole === "p1",
		localStream,
		incomingSignal,
		onSignal,
	});

	const useDeepgram = dgSupported && dgSecure && !useChunkFallback;
	const recSupported = useDeepgram ? dgSupported : chunkSupported;
	const recSecure = useDeepgram ? dgSecure : chunkSecure;
	const listening = useDeepgram ? dgListening : chunkListening;
	const recError = useDeepgram ? dgError : chunkError;
	const transcript = useDeepgram ? dgTranscript : chunkTranscript;
	const interim = useDeepgram ? dgInterim : "";
	const recStart = useDeepgram ? dgStart : chunkStart;
	const recStop = useDeepgram ? dgStop : chunkStop;
	// Mic inutilizable (sin permiso, sin soporte o contexto inseguro): el MC
	// nunca queda mudo — se abre el modo texto como respaldo.
	const micBlocked =
		!recSupported ||
		!recSecure ||
		recError === "not-allowed" ||
		recError === "insecure" ||
		recError === "unsupported";
	const liveText = `${transcript} ${interim}`.trim() || (micBlocked ? draft : "");
	const turnKey = `${battle.battleId}:${battle.replicaCount}:${battle.round}:${battle.activeRole ?? "none"}`;

	useEffect(() => {
		if (dgError === "connection" || dgError === "No se pudo conectar a Deepgram") {
			setUseChunkFallback(true);
		}
	}, [dgError]);

	const activateMic = useCallback(() => {
		recStart((full) => onCaption(full));
	}, [recStart, onCaption]);

	useEffect(() => {
		if (!isMyTurn) return;
		if (handledTurn.current === turnKey) return;
		handledTurn.current = turnKey;
		submittedTurn.current = null;
		setDraft("");
		if (recSupported && recSecure) activateMic();
	}, [isMyTurn, turnKey, recSupported, recSecure, activateMic]);

	const submit = useCallback(() => {
		if (submittedTurn.current === turnKey) return;
		submittedTurn.current = turnKey;
		// Combinar lo transcripto por voz con lo tipeado (modo respaldo).
		const voice = recSupported ? recStop() : "";
		const text = [voice, draft.trim()].filter(Boolean).join(" ").trim();
		onSubmitVerse(text);
		setDraft("");
	}, [turnKey, recSupported, recStop, draft, onSubmitVerse]);

	useEffect(() => {
		if (isMyTurn && remaining !== null && remaining <= 1 && submittedTurn.current !== turnKey) {
			submit();
		}
	}, [isMyTurn, remaining, turnKey, submit]);

	useEffect(() => {
		if (battle.phase === "countdown" || battle.phase === "turn") {
			void ensureActive();
		}
	}, [battle.phase, battle.replicaCount, ensureActive]);

	const handleDraft = (text: string) => {
		setDraft(text);
		onCaption(text);
	};

	const mod = MODALITIES[battle.modality];
	const beatIsActive = Boolean(battle.beat?.audioUrl && (battle.phase === "countdown" || battle.phase === "turn"));

	const playBeat = useCallback(() => {
		const audio = beatAudioRef.current;
		if (!audio) return;
		audio.volume = 0.38;
		audio.loop = true;
		audio.play().then(
			() => setBeatBlocked(false),
			() => setBeatBlocked(true),
		);
	}, []);

	useEffect(() => {
		const audio = beatAudioRef.current;
		if (!audio) return;
		if (beatIsActive) {
			playBeat();
		} else {
			audio.pause();
			setBeatBlocked(false);
		}
	}, [beatIsActive, battle.beat?.audioUrl, playBeat]);

	// Result phase
	if (battle.phase === "result" && battle.verdict) {
		return <ResultScreen battle={battle} myRole={myRole} onLeave={onLeave} />;
	}

	// Aborted
	if (battle.phase === "aborted") {
		return (
			<div className="battle-phase">
				<div className="arena-grain" />
				<div className="arena-vignette" />
				<div className="battle-searching-title" style={{ color: "var(--bone)" }}>BATALLA TERMINADA</div>
				<p style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.3em", color: "var(--bone-dim)", textTransform: "uppercase" }}>
					EL RIVAL ABANDONÓ LA BATALLA
				</p>
				<button onClick={onLeave} className="btn-ghost">VOLVER AL INICIO</button>
			</div>
		);
	}

	// Lobby / ready check phases (full-screen overlay)
	if (battle.phase === "lobby" || battle.phase === "ready_check") {
		return (
			<div className="battle-phase">
				<div className="arena-grain" />
				<div className="arena-vignette" />
				{battle.phase === "lobby" ? (
					<>
						<div className="battle-radar"><div className="core" /></div>
						<div className="battle-searching-title">CONECTANDO<span className="red">…</span></div>
						<div className="battle-searching-sub">ESPERANDO AL RIVAL</div>
					</>
				) : (
					<>
						{/* VS splash */}
						<div className="splash-names">
							<div className="splash-name-left">{me.name || "TÚ"}</div>
							<div className="splash-vs">VS</div>
							<div className="splash-name-right">{opp.name || "???"}</div>
						</div>
						<div className="splash-mode">MODO — {mod.name.toUpperCase()}</div>
						{battle.beat && <div className="splash-mode">BEAT — {battle.beat.name.toUpperCase()}</div>}

						<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 20 }}>
							<button
								onClick={onReady}
								disabled={me.ready}
								className="btn-arena"
								style={{ fontSize: 22, padding: "18px 48px" }}
							>
								<span>{me.ready ? "ESPERANDO AL RIVAL…" : "ESTOY LISTO ⚔"}</span>
							</button>
							{!me.ready && (
								<p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--bone-dim)" }}>
									PROBÁ TU CÁMARA Y MIC ANTES DE CONFIRMAR
								</p>
							)}
						</div>
					</>
				)}
				<button onClick={onLeave} className="btn-ghost">ABANDONAR</button>
			</div>
		);
	}

	return (
		<>
			{/* ===== BATTLE ARENA ===== */}
			<div className="battle-arena">
				{battle.beat?.audioUrl && <audio ref={beatAudioRef} src={battle.beat.audioUrl} preload="auto" loop />}
				{/* Me */}
				<PlayerPanel
					player={me}
					isSelf
					isActive={battle.phase === "turn" && battle.activeRole === myRole}
					caption={isMyTurn ? liveText : ""}
					verses={battle.verses[myRole]}
					stream={localStream}
					videoMuted
					remaining={battle.phase === "turn" && battle.activeRole === myRole ? remaining : null}
				/>

				{/* Rival */}
				<PlayerPanel
					player={opp}
					isSelf={false}
					isActive={battle.phase === "turn" && battle.activeRole === oppRole}
					caption={battle.phase === "turn" && battle.activeRole === oppRole ? opponentCaption : ""}
					verses={battle.verses[oppRole]}
					stream={remoteStream}
					videoMuted={false}
					mirror
					mediaStatus={remoteStream ? undefined : peerStatus === "failed" ? "media desconectada" : "conectando"}
					remaining={battle.phase === "turn" && battle.activeRole === oppRole ? remaining : null}
				/>

				{/* Crowd reactions */}
				<CrowdReactions active={battle.phase === "turn"} />

				{/* VS badge */}
				<div className="vs-badge">VS</div>

				{/* Turn banner */}
				<div className="turn-banner">
					<div className="turn-who">
						{battle.phase === "turn" ? (
							<>
								TURNO:{" "}
								<span className="red">
									{battle.activeRole === myRole ? me.name || "TÚ" : opp.name || "RIVAL"}
								</span>
							</>
						) : battle.phase === "countdown" ? (
							"PREPARANDO…"
						) : battle.phase === "judging" ? (
							<>⚖️ JUEZ EVALUANDO…</>
						) : (
							"EN ARENA"
						)}
					</div>
					<div className="turn-round">
						{mod.name.toUpperCase()} · RONDA {Math.max(1, battle.round)}/{battle.totalRounds}
					</div>
					{battle.beat && (
						<div className="turn-beat">
							BEAT: {battle.beat.name.toUpperCase()}
							{battle.beat.bpm ? ` · ${battle.beat.bpm} BPM` : ""}
							{beatBlocked && (
								<button onClick={playBeat} type="button">
									ACTIVAR
								</button>
							)}
						</div>
					)}
				</div>

				{/* Prompt words */}
				{battle.words.length > 0 && (
					<div className="prompt-zone">
						<div className="prompt-label">PALABRAS OBLIGATORIAS</div>
						<div className="prompt-word">{battle.words.join(" · ")}</div>
					</div>
				)}

				{/* Countdown overlay */}
				{battle.phase === "countdown" && (
					<div className="battle-countdown">
						<div className="battle-countdown-num">
							{remaining !== null && remaining > 0 ? remaining : "¡YA!"}
						</div>
					</div>
				)}

				{/* Conexión: avisos no bloqueantes */}
				{(reconnecting || !opp.connected) && (
					<div className="conn-banner">
						<span className="arena-live-dot" style={{ margin: 0 }} />
						{reconnecting ? "RECONECTANDO CON LA SALA…" : "EL RIVAL PERDIÓ CONEXIÓN — ESPERANDO…"}
					</div>
				)}

				{/* Controls for my turn */}
				{battle.phase === "turn" && isMyTurn && (
					<div className="fighter-controls" style={{ left: "0%", right: "50%", bottom: 20 }}>
						{!micBlocked ? (
							<>
								{(!listening || recError) && (
									<button
										onClick={activateMic}
										className="btn-ghost"
										style={{ fontSize: 11, padding: "10px 18px" }}
									>
										{recError ? "⚠ REINTENTAR MIC" : "🎤 ACTIVAR MIC"}
									</button>
								)}
								{listening && (
									<span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--red)", display: "flex", alignItems: "center", gap: 6 }}>
										<span className="arena-live-dot" style={{ margin: 0 }} />
										ESCUCHANDO
									</span>
								)}
								<button onClick={submit} className="btn-arena" style={{ fontSize: 14, padding: "10px 24px" }}>
									<span>TERMINAR TURNO</span>
								</button>
							</>
						) : (
							<>
								{recSupported && recSecure && (
									<button
										onClick={activateMic}
										className="btn-ghost"
										style={{ fontSize: 11, padding: "10px 18px" }}
									>
										⚠ REINTENTAR MIC
									</button>
								)}
								<button onClick={submit} className="btn-arena" style={{ fontSize: 14, padding: "10px 24px" }}>
									<span>ENVIAR VERSO</span>
								</button>
							</>
						)}
					</div>
				)}

				{/* Text input fallback on my turn (mic bloqueado o sin soporte) */}
				{battle.phase === "turn" && isMyTurn && micBlocked && (
					<div style={{ position: "absolute", bottom: 70, left: 0, right: "50%", zIndex: 15, padding: "0 18px" }}>
						<div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--red)", marginBottom: 6 }}>
							{recError === "not-allowed" ? "MIC SIN PERMISO — MODO TEXTO" : "MODO TEXTO"}
						</div>
						<textarea
							autoFocus
							value={draft}
							onChange={(e) => handleDraft(e.target.value)}
							placeholder="Escribí tu rima…"
							className="verse-draft"
						/>
					</div>
				)}

				{/* Leave button */}
				<button
					onClick={onLeave}
					className="btn-ghost"
					style={{ position: "absolute", top: 20, right: 20, zIndex: 25, fontSize: 10 }}
				>
					ABANDONAR
				</button>
			</div>
		</>
	);
}

function ResultScreen({ battle, myRole, onLeave }: { battle: BattleState; myRole: Role; onLeave: () => void }) {
	const v = battle.verdict!;
	const draw = v.winner === "draw";
	const youWon = !draw && v.winner === myRole;
	const [stage, setStage] = useState<"suspense" | "votes" | "final">("suspense");
	const winnerRole = draw ? null : (v.winner as Role);
	const winnerName = winnerRole ? battle.players[winnerRole].name.toUpperCase() : "RÉPLICA";
	const winnerVotes = winnerRole ? v.judges.filter((judge) => judge.vote === winnerRole).length : 0;
	const voteLine = draw
		? "3 JUECES PIDEN RÉPLICA"
		: winnerVotes === 3
			? "UNANIMIDAD"
			: `${winnerVotes} - ${3 - winnerVotes}`;
	const title = draw ? "RÉPLICA" : youWon ? "GANASTE" : "PERDISTE";
	const myElo = v.elo?.[myRole] ?? null;

	useEffect(() => {
		const votes = setTimeout(() => setStage("votes"), 1000);
		const final = setTimeout(() => setStage("final"), 2850);
		return () => {
			clearTimeout(votes);
			clearTimeout(final);
		};
	}, [battle.battleId, battle.replicaCount]);

	return (
		<div className="battle-phase translucent">
			<div className="arena-grain" />
			<div className="arena-vignette" />
			<div className="judgment-kicker">
				{stage === "suspense" ? "EL JURADO DELIBERA" : voteLine}
			</div>

			<div className={`judge-row stage-${stage}`}>
				{v.judges.map((judge, index) => (
					<JudgeCard
						key={judge.judge}
						vote={judge.vote}
						names={{ p1: battle.players.p1.name, p2: battle.players.p2.name }}
						delay={index * 220}
					/>
				))}
			</div>

			<div className={`winner-name result-title stage-${stage}`} style={{ color: draw || youWon ? "var(--red)" : "var(--bone-dim)" }}>
				{stage === "suspense" ? "..." : stage === "final" ? title : winnerName}
			</div>

			{stage !== "suspense" && (v.detail ? (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24, width: "min(720px, 92vw)", marginTop: 10 }}>
					<div className={`result-score-card${v.winner === "p1" ? " winner" : ""}`}>
						<PlayerScore name={battle.players.p1.name} total={v.scores.p1} pv={v.detail.p1} highlight={v.winner === "p1"} />
					</div>
					<div className={`result-score-card${v.winner === "p2" ? " winner" : ""}`}>
						<PlayerScore name={battle.players.p2.name} total={v.scores.p2} pv={v.detail.p2} highlight={v.winner === "p2"} />
					</div>
				</div>
			) : (
				<div style={{ display: "flex", gap: 40, fontFamily: "var(--font-display)", fontSize: 32, textTransform: "uppercase" }}>
					<div style={{ textAlign: "center" }}>
						<div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--bone-dim)", marginBottom: 4 }}>{battle.players.p1.name}</div>
						{v.scores.p1}
					</div>
					<div style={{ color: "var(--bone-dim)", alignSelf: "center", fontSize: 20 }}>VS</div>
					<div style={{ textAlign: "center" }}>
						<div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--bone-dim)", marginBottom: 4 }}>{battle.players.p2.name}</div>
						{v.scores.p2}
					</div>
				</div>
			))}

			{stage === "final" && !draw && (
				<div className={`elo-impact${v.elo?.ranked ? " ranked" : ""}`}>
					{v.elo?.ranked && myElo ? (
						<AnimatedElo before={myElo.before} after={myElo.after} delta={myElo.delta} />
					) : (
						<span>{v.elo?.reason ?? "ELO no disponible"}</span>
					)}
				</div>
			)}

			{stage === "final" && draw && <div className="replica-note">LA SALA ARRANCA DE NUEVO</div>}

			{stage === "final" && v.rationale && (
				<div style={{ maxWidth: 600, background: "var(--ink-2)", border: "1px solid var(--line)", borderLeft: "4px solid var(--red)", padding: "14px 20px", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--bone-dim)", lineHeight: 1.5 }}>
					<span style={{ color: "var(--red)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>EL JURADO</span>
					{v.rationale}
				</div>
			)}

			{stage === "final" && !draw && (
				<div style={{ display: "flex", gap: 18, marginTop: 10 }}>
					<button onClick={onLeave} className="btn-arena" style={{ fontSize: 20, padding: "16px 36px" }}>
						<span>REVANCHA</span>
					</button>
					<button onClick={onLeave} className="btn-ghost">SALIR DE LA ARENA</button>
				</div>
			)}
		</div>
	);
}

function JudgeCard({
	vote,
	names,
	delay,
}: {
	vote: Role | "replica";
	names: { p1: string; p2: string };
	delay: number;
}) {
	const label = vote === "replica" ? "RÉPLICA" : (names[vote] || vote).toUpperCase();
	return (
		<div className={`judge-card vote-${vote}`} style={{ animationDelay: `${delay}ms` }}>
			<div className="judge-body">
				<span className="judge-head" />
				<span className="judge-arm left" />
				<span className="judge-arm right" />
			</div>
			<div className="judge-label">{label}</div>
		</div>
	);
}

function AnimatedElo({ before, after, delta }: { before: number | null; after: number | null; delta: number }) {
	const [value, setValue] = useState(before ?? after ?? 0);

	useEffect(() => {
		if (before === null || after === null) return;
		const steps = 18;
		let current = 0;
		const id = setInterval(() => {
			current += 1;
			const t = current / steps;
			setValue(Math.round(before + (after - before) * t));
			if (current >= steps) clearInterval(id);
		}, 38);
		return () => clearInterval(id);
	}, [before, after]);

	if (before === null || after === null) return null;
	return (
		<>
			<span className="elo-before">{before}</span>
			<span className={`elo-delta${delta >= 0 ? " plus" : " minus"}`}>
				{delta >= 0 ? "+" : ""}
				{delta}
			</span>
			<span className="elo-after">{value}</span>
		</>
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
		<div>
			<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
				<span style={{ fontFamily: "var(--font-display)", fontSize: 20, textTransform: "uppercase", color: highlight ? "var(--red)" : "var(--bone)" }}>{name}</span>
				<span style={{ fontFamily: "var(--font-display)", fontSize: 36, color: highlight ? "var(--red)" : "var(--bone)" }}>{total}</span>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{CRITERIA.map((c) => {
					const val = pv.criteria[c];
					return (
						<div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--bone-dim)", width: 56, flexShrink: 0 }}>{CRITERIA_LABELS[c]}</span>
							{val === null ? (
								<span style={{ color: "var(--line)" }}>—</span>
							) : (
								<>
									<div style={{ flex: 1, height: 4, background: "var(--ink-3)", border: "1px solid var(--line)", overflow: "hidden" }}>
										<div style={{ height: "100%", background: "var(--red)", width: `${val * 10}%`, boxShadow: "0 0 6px rgba(232,25,44,0.5)" }} />
									</div>
									<span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bone-dim)", width: 20, textAlign: "right" }}>{val}</span>
								</>
							)}
						</div>
					);
				})}
			</div>
			{pv.comment && (
				<p style={{ marginTop: 10, fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--bone-dim)", lineHeight: 1.4 }}>{pv.comment}</p>
			)}
		</div>
	);
}
