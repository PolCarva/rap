"use client";

import {
	CRITERIA,
	CRITERIA_LABELS,
	MODALITIES,
	roundStarter,
	type BattleState,
	type PlayerVerdict,
	type RtcSignal,
	type Role,
} from "@rap/shared";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CrowdReactions } from "@/components/CrowdReactions";
import { PlayerPanel } from "./PlayerPanel";

const JudgesScene = dynamic(() => import("@/components/three/JudgesScene").then((m) => m.JudgesScene), {
	ssr: false,
});
import { useBeatPlayer } from "./useBeatPlayer";
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
	onRematch: () => void;
	onLeave: () => void;
	/** Re-encolar con la misma config (cuando el rival abandonó). */
	onRequeue?: (() => void) | null;
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

/** Minúsculas y sin tildes, para chequear palabras usadas en vivo. */
function normalizeWords(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

/**
 * Tick sonoro de la cuenta atrás: un blip por segundo y un golpe más grave y
 * largo en el "¡YA!". El AudioContext nace tras el gesto de "ESTOY LISTO",
 * así que el autoplay no lo bloquea.
 */
function useCountdownSound(active: boolean, remaining: number | null) {
	const ctxRef = useRef<AudioContext | null>(null);
	const lastRef = useRef<number | null>(null);

	useEffect(() => {
		if (!active || remaining === null) {
			lastRef.current = null;
			return;
		}
		if (lastRef.current === remaining) return;
		lastRef.current = remaining;
		try {
			const Ctor =
				window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			ctxRef.current = ctxRef.current ?? new Ctor();
			const ctx = ctxRef.current;
			if (ctx.state === "suspended") void ctx.resume().catch(() => {});
			const go = remaining <= 0;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "triangle";
			osc.frequency.value = go ? 220 : 660;
			const dur = go ? 0.5 : 0.1;
			gain.gain.setValueAtTime(go ? 0.3 : 0.16, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + dur + 0.05);
		} catch {
			/* sin audio: la cuenta sigue siendo visual */
		}
	}, [active, remaining]);

	useEffect(
		() => () => {
			ctxRef.current?.close().catch(() => {});
			ctxRef.current = null;
		},
		[],
	);
}

/**
 * Botón de abandono en dos pasos: un mis-click en plena batalla no puede
 * costar la derrota. El armado se desarma solo a los 3s.
 */
function ConfirmLeaveButton({ onLeave, style }: { onLeave: () => void; style?: React.CSSProperties }) {
	const [armed, setArmed] = useState(false);
	useEffect(() => {
		if (!armed) return;
		const t = setTimeout(() => setArmed(false), 3000);
		return () => clearTimeout(t);
	}, [armed]);
	return (
		<button
			onClick={() => (armed ? onLeave() : setArmed(true))}
			className="btn-ghost"
			style={{ ...style, ...(armed ? { color: "var(--red)", borderColor: "var(--red)" } : undefined) }}
		>
			{armed ? "¿SEGURO? TOCÁ DE NUEVO" : "ABANDONAR"}
		</button>
	);
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
	onRematch,
	onLeave,
	onRequeue,
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
	const handledTurn = useRef<string | null>(null);
	const submittedTurn = useRef<string | null>(null);
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
	// Caption en vivo: borrador (texto preservado/tipeado) + voz transcripta.
	const liveText = [draft.trim(), transcript, interim].filter(Boolean).join(" ").trim();
	const turnKey = `${battle.battleId}:${battle.replicaCount}:${battle.round}:${battle.activeRole ?? "none"}`;

	useEffect(() => {
		if (dgError === "connection" || dgError === "No se pudo conectar a Deepgram") {
			setUseChunkFallback(true);
		}
	}, [dgError]);

	const activateMic = useCallback(() => {
		recStart((full) => onCaption(full), battle.words);
	}, [recStart, onCaption, battle.words]);

	useEffect(() => {
		if (!isMyTurn) return;
		if (handledTurn.current === turnKey) return;
		handledTurn.current = turnKey;
		submittedTurn.current = null;
		setDraft("");
		if (recSupported && recSecure) activateMic();
	}, [isMyTurn, turnKey, recSupported, recSecure, activateMic]);

	// Deepgram se cayó a mitad de MI turno: preservar lo ya transcripto en el
	// borrador y arrancar el grabador de respaldo sin perder el turno.
	const fallbackHandled = useRef<string | null>(null);
	useEffect(() => {
		if (!useChunkFallback || !isMyTurn) return;
		if (fallbackHandled.current === turnKey) return;
		fallbackHandled.current = turnKey;
		if (dgTranscript) setDraft((d) => [d.trim(), dgTranscript].filter(Boolean).join(" "));
		if (chunkSupported && chunkSecure && !chunkListening) {
			chunkStart((full) => onCaption(full));
		}
	}, [useChunkFallback, isMyTurn, turnKey, dgTranscript, chunkSupported, chunkSecure, chunkListening, chunkStart, onCaption]);

	const submit = useCallback(() => {
		if (submittedTurn.current === turnKey) return;
		submittedTurn.current = turnKey;
		// Combinar lo transcripto por voz con lo tipeado (modo respaldo).
		const voice = recSupported ? recStop() : "";
		const text = [voice, draft.trim()].filter(Boolean).join(" ").trim();
		onSubmitVerse(text);
		setDraft("");
	}, [turnKey, recSupported, recStop, draft, onSubmitVerse]);

	// Enviar recién cuando el reloj llega a 0 (no antes: el último segundo es
	// tuyo). El server da unos segundos de gracia para el verso final.
	useEffect(() => {
		if (isMyTurn && remaining !== null && remaining <= 0 && submittedTurn.current !== turnKey) {
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

	// Quién abre (para anunciarlo en la cuenta atrás).
	const firstUp = battle.players[roundStarter(1, battle.replicaCount)];
	useCountdownSound(battle.phase === "countdown", remaining);

	// Palabras ya usadas por el MC activo (sus versos + lo que va diciendo).
	const activeRoleNow = battle.phase === "turn" ? battle.activeRole : null;
	const activeRunningText = activeRoleNow
		? [...battle.verses[activeRoleNow], activeRoleNow === myRole ? liveText : opponentCaption].join(" ")
		: "";
	const usedWords = useMemo(() => {
		if (battle.words.length === 0) return [];
		const text = normalizeWords(activeRunningText);
		return battle.words.map((w) => {
			const key = normalizeWords(w).split(/\s+/).pop()!;
			return text.includes(key);
		});
	}, [battle.words, activeRunningText]);

	const beatIsActive = Boolean(battle.beat?.audioUrl && (battle.phase === "countdown" || battle.phase === "turn"));
	const beatPlayer = useBeatPlayer();
	const { play: playBeatTrack, stop: stopBeatTrack } = beatPlayer;

	useEffect(() => {
		if (beatIsActive && battle.beat) {
			void playBeatTrack(battle.beat, 0.35);
		} else {
			stopBeatTrack();
		}
	}, [beatIsActive, battle.beat, playBeatTrack, stopBeatTrack]);

	// Result phase
	if (battle.phase === "result" && battle.verdict) {
		return <ResultScreen battle={battle} myRole={myRole} onRematch={onRematch} onLeave={onLeave} />;
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
				<div style={{ display: "flex", gap: 18 }}>
					{onRequeue && (
						<button onClick={onRequeue} className="btn-arena" style={{ fontSize: 16, padding: "14px 30px" }}>
							<span>BUSCAR OTRO RIVAL</span>
						</button>
					)}
					<button onClick={onLeave} className="btn-ghost">VOLVER AL INICIO</button>
				</div>
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
				<ConfirmLeaveButton onLeave={onLeave} />
			</div>
		);
	}

	return (
		<>
			{/* ===== BATTLE ARENA ===== */}
			<div
				className={`battle-arena${beatIsActive ? " grooving" : ""}`}
				style={{ "--beat-period": `${(60 / (battle.beat?.bpm ?? 90)).toFixed(3)}s` } as React.CSSProperties}
			>
				{/* Flash al cambiar de turno */}
				{battle.phase === "turn" && <div key={turnKey} className="turn-flash" />}
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
							remaining !== null && remaining <= 0 ? (
								// Gracia del server: el verso final está viajando.
								<>CERRANDO TURNO…</>
							) : (
								<>
									TURNO:{" "}
									<span className="red">
										{battle.activeRole === myRole ? me.name || "TÚ" : opp.name || "RIVAL"}
									</span>
								</>
							)
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
							{beatPlayer.blocked && (
								<button onClick={beatPlayer.unlock} type="button">
									ACTIVAR
								</button>
							)}
						</div>
					)}
				</div>

				{/* Prompt words: se tachan en vivo al usarlas */}
				{battle.words.length > 0 && (
					<div className="prompt-zone">
						<div className="prompt-label">
							{battle.modality === "deconceptos" ? "CONCEPTOS A DESARROLLAR" : "PALABRAS OBLIGATORIAS"}
						</div>
						<div className="prompt-word">
							{battle.words.map((w, i) => (
								<span key={w}>
									{i > 0 && <span className="pw-sep">·</span>}
									<span className={`pw${usedWords[i] ? " used" : ""}`}>{w}</span>
								</span>
							))}
						</div>
					</div>
				)}

				{/* Countdown overlay: cada tick entra con un punch y anuncia quién abre */}
				{battle.phase === "countdown" && (
					<div className="battle-countdown">
						<div key={remaining ?? "ya"} className="battle-countdown-num punch">
							{remaining !== null && remaining > 0 ? remaining : "¡YA!"}
						</div>
						<div className="battle-countdown-starter">
							ABRE <span className="red">{(firstUp.name || "MC").toUpperCase()}</span>
							{battle.replicaCount > 0 ? " · RÉPLICA" : ""}
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

				{/* Juicio: interstitial dramático mientras delibera la IA */}
				{battle.phase === "judging" && (
					<div className="judging-overlay">
						<div className="judging-scales">⚖</div>
						<div className="judging-title">EL JURADO DELIBERA</div>
						<div className="judging-sub">ANALIZANDO FLOW · RIMAS · PUNCHLINES</div>
						<div className="judging-bar"><span /></div>
					</div>
				)}

				{/* Controls for my turn */}
				{battle.phase === "turn" && isMyTurn && (
					<div className="fighter-controls mine">
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
					<div className="verse-draft-zone">
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

				{/* Leave button (dos pasos: la batalla no se pierde por un mis-click) */}
				<ConfirmLeaveButton
					onLeave={onLeave}
					style={{ position: "absolute", top: 20, right: 20, zIndex: 25, fontSize: 10 }}
				/>
			</div>
		</>
	);
}

function ResultScreen({
	battle,
	myRole,
	onRematch,
	onLeave,
}: {
	battle: BattleState;
	myRole: Role;
	onRematch: () => void;
	onLeave: () => void;
}) {
	const v = battle.verdict!;
	const draw = v.winner === "draw";
	const youWon = !draw && v.winner === myRole;
	const [stage, setStage] = useState<"suspense" | "votes" | "final">("suspense");
	const oppRole: Role = myRole === "p1" ? "p2" : "p1";
	const opp = battle.players[oppRole];
	const iWantRematch = battle.players[myRole].wantsRematch;
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

			<div className={`judge-zone stage-${stage}`}>
				<JudgesScene votes={v.judges} stage={stage} />
				<div className="judge-vote-labels">
					{v.judges.map((judge) => {
						const label =
							judge.vote === "replica"
								? "RÉPLICA"
								: (battle.players[judge.vote].name || judge.vote).toUpperCase();
						return (
							<span key={judge.judge} className={`judge-vote-label vote-${judge.vote}${stage !== "suspense" ? " shown" : ""}`}>
								{stage === "suspense" ? "…" : label}
							</span>
						);
					})}
				</div>
			</div>

			<div className={`winner-name result-title stage-${stage}`} style={{ color: draw || youWon ? "var(--red)" : "var(--bone-dim)" }}>
				{stage === "suspense" ? "..." : stage === "final" ? title : winnerName}
			</div>

			{stage !== "suspense" && (v.detail ? (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24, width: "min(720px, 92vw)", marginTop: 10 }}>
					<div className={`result-score-card${v.winner === "p1" ? " winner" : ""}`}>
						<PlayerScore name={battle.players.p1.name} total={v.scores.p1} pv={v.detail.p1} highlight={v.winner === "p1"} elo={v.elo?.ranked ? v.elo.p1 : null} />
					</div>
					<div className={`result-score-card${v.winner === "p2" ? " winner" : ""}`}>
						<PlayerScore name={battle.players.p2.name} total={v.scores.p2} pv={v.detail.p2} highlight={v.winner === "p2"} elo={v.elo?.ranked ? v.elo.p2 : null} />
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
				v.elo?.ranked && myElo && myElo.before !== null && myElo.after !== null ? (
					<div className={`elo-stage ${myElo.delta >= 0 ? "up" : "down"}`}>
						<span className="elo-stage-label">TU ELO</span>
						<AnimatedElo before={myElo.before} after={myElo.after} delta={myElo.delta} />
					</div>
				) : (
					<div className="elo-impact">
						<span>{v.elo?.reason ?? "Batalla no rankeada: entrá con tu cuenta para mover ELO"}</span>
					</div>
				)
			)}

			{stage === "final" && draw && <div className="replica-note">LA SALA ARRANCA DE NUEVO</div>}

			{stage === "final" && v.rationale && (
				<div style={{ maxWidth: 600, background: "var(--ink-2)", border: "1px solid var(--line)", borderLeft: "4px solid var(--red)", padding: "14px 20px", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--bone-dim)", lineHeight: 1.5 }}>
					<span style={{ color: "var(--red)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>EL JURADO</span>
					{v.rationale}
				</div>
			)}

			{stage === "final" && !draw && (
				<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 10 }}>
					<div style={{ display: "flex", gap: 18 }}>
						{opp.connected ? (
							<button
								onClick={onRematch}
								disabled={iWantRematch}
								className="btn-arena"
								style={{ fontSize: 20, padding: "16px 36px" }}
							>
								<span>{iWantRematch ? "ESPERANDO AL RIVAL…" : "REVANCHA ⚔"}</span>
							</button>
						) : (
							<button onClick={onLeave} className="btn-arena" style={{ fontSize: 20, padding: "16px 36px" }}>
								<span>OTRA BATALLA</span>
							</button>
						)}
						<button onClick={onLeave} className="btn-ghost">SALIR DE LA ARENA</button>
					</div>
					{opp.connected && opp.wantsRematch && !iWantRematch && (
						<div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--red)" }}>
							{(opp.name || "EL RIVAL").toUpperCase()} PIDE REVANCHA
						</div>
					)}
					{!opp.connected && (
						<div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--bone-dim)" }}>
							EL RIVAL DEJÓ LA SALA
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function AnimatedElo({ before, after, delta }: { before: number; after: number; delta: number }) {
	const [value, setValue] = useState(before);
	const [done, setDone] = useState(false);

	// Conteo con ease-out + ligera demora dramática antes de arrancar.
	useEffect(() => {
		const DELAY = 600;
		const DURATION = 1700;
		let raf = 0;
		const t0 = performance.now();
		const tick = (now: number) => {
			const elapsed = now - t0 - DELAY;
			if (elapsed < 0) {
				raf = requestAnimationFrame(tick);
				return;
			}
			const p = Math.min(1, elapsed / DURATION);
			const eased = 1 - Math.pow(1 - p, 3);
			setValue(Math.round(before + (after - before) * eased));
			if (p < 1) raf = requestAnimationFrame(tick);
			else setDone(true);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [before, after]);

	return (
		<div className="elo-counter">
			<span className={`elo-big${done ? " done" : ""}`}>{value}</span>
			<span className={`elo-delta-badge${delta >= 0 ? " plus" : " minus"}`}>
				{delta >= 0 ? "▲ +" : "▼ "}
				{delta}
			</span>
		</div>
	);
}

function PlayerScore({
	name,
	total,
	pv,
	highlight,
	elo,
}: {
	name: string;
	total: number;
	pv: PlayerVerdict;
	highlight: boolean;
	elo?: { before: number | null; after: number | null; delta: number } | null;
}) {
	return (
		<div>
			<div className={`crit-head${highlight ? " hl" : ""}`}>
				<span className="crit-name">{name}</span>
				<span className="crit-total">{total}</span>
			</div>
			{elo && elo.before !== null && elo.after !== null && (
				<div
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: 11,
						letterSpacing: "0.14em",
						color: elo.delta >= 0 ? "var(--bone)" : "var(--bone-dim)",
						margin: "4px 0 2px",
					}}
				>
					ELO {elo.before} → {elo.after}{" "}
					<span style={{ color: elo.delta >= 0 ? "#34d399" : "var(--red)" }}>
						({elo.delta >= 0 ? "+" : ""}
						{elo.delta})
					</span>
				</div>
			)}
			<div className="crit-list">
				{CRITERIA.map((c, index) => {
					const val = pv.criteria[c];
					return (
						<div key={c} className="crit-row">
							<span className="crit-label">{CRITERIA_LABELS[c]}</span>
							{val === null ? (
								<span className="crit-na">—</span>
							) : (
								<>
									<div className="crit-bar">
										<span style={{ width: `${val * 10}%`, animationDelay: `${300 + index * 110}ms` }} />
									</div>
									<span className="crit-val">{val}</span>
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
