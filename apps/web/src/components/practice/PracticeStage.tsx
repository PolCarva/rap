"use client";

import {
	CRITERIA,
	CRITERIA_LABELS,
	countdownMs,
	drawWordsForModality,
	MODALITIES,
	promptBatchesPerTurn,
	promptIntervalMs,
	roundStarter,
	turnDurationMs,
	wordBatchesForRole,
	type BattleState,
	type PlayerVerdict,
	type Role,
	type Verdict,
	type WordPlan,
} from "@rap/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChunkedTranscription } from "@/components/battle/useChunkedTranscription";
import { useDeepgramTranscription } from "@/components/battle/useDeepgramTranscription";
import { useBeatPlayer } from "@/components/battle/useBeatPlayer";
import type { MediaController } from "@/components/battle/useMediaStream";
import { RhymeText } from "@/components/battle/RhymeText";
import { judgeUrl } from "@/lib/realtime";
import type { PracticeConfig } from "./PracticeSetup";

interface Props {
	config: PracticeConfig;
	media: MediaController;
	onExit: () => void;
	onRestart: () => void;
}

type Phase = "ready" | "countdown" | "turn" | "judging" | "result";

interface PracticeTurn {
	role: Role;
	round: number;
}

function buildTurns(rounds: number, versus: boolean): PracticeTurn[] {
	const turns: PracticeTurn[] = [];
	for (let round = 1; round <= rounds; round++) {
		if (versus) {
			const first = roundStarter(round, 0);
			const second: Role = first === "p1" ? "p2" : "p1";
			turns.push({ role: first, round }, { role: second, round });
		} else {
			turns.push({ role: "p1", round });
		}
	}
	return turns;
}

function normalizeWords(s: string): string {
	return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function useClock(deadline: number | null): { remaining: number | null; now: number } {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (deadline === null) return;
		setNow(Date.now());
		const id = setInterval(() => setNow(Date.now()), 150);
		return () => clearInterval(id);
	}, [deadline]);
	return { remaining: deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000)), now };
}

export function PracticeStage({ config, media, onExit, onRestart }: Props) {
	const versus = config.mode === "versus";
	const mod = MODALITIES[config.modality];
	const bpm = config.beat?.bpm ?? null;
	const turnMs = turnDurationMs(mod, bpm);
	const cdMs = countdownMs(bpm);
	const batchesPerTurn = promptBatchesPerTurn(mod, bpm);
	const promptInterval = promptIntervalMs(mod, bpm);
	const mediaRequirements = useMemo(() => ({ audio: true, video: config.useCamera }), [config.useCamera]);

	// Palabras/plan sorteados una sola vez para toda la sesión (init perezoso).
	const [plan] = useState<{ words: string[]; wordPlan: WordPlan | null }>(() =>
		drawWordsForModality(config.modality, bpm),
	);
	const { words, wordPlan } = plan;

	const turns = useMemo(() => buildTurns(mod.rounds, versus), [mod.rounds, versus]);

	const [step, setStep] = useState(0);
	const [phase, setPhase] = useState<Phase>("ready");
	const [deadline, setDeadline] = useState<number | null>(null);
	const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
	const [verses, setVerses] = useState<{ p1: string[]; p2: string[] }>({ p1: [], p2: [] });
	const [draft, setDraft] = useState("");
	const [verdict, setVerdict] = useState<Verdict | null>(null);
	const [judgeError, setJudgeError] = useState<string | null>(null);

	const current = turns[step];
	const activeRole = current?.role ?? "p1";
	const activeName = activeRole === "p1" ? config.name1 : config.name2;
	const { remaining, now } = useClock(deadline);

	// --- Transcripción (igual que la batalla: Deepgram con respaldo chunked) ---
	const dg = useDeepgramTranscription();
	const chunk = useChunkedTranscription();
	const [useChunkFallback, setUseChunkFallback] = useState(false);
	const useDeepgram = dg.supported && dg.secure && !useChunkFallback;
	const { supported: chunkSupported, secure: chunkSecure, listening: chunkListening, start: chunkStart } = chunk;
	const recStart = useDeepgram ? dg.start : chunk.start;
	const recStop = useDeepgram ? dg.stop : chunk.stop;
	const recSupported = useDeepgram ? dg.supported : chunk.supported;
	const recSecure = useDeepgram ? dg.secure : chunk.secure;
	const listening = useDeepgram ? dg.listening : chunk.listening;
	const recError = useDeepgram ? dg.error : chunk.error;
	const transcript = useDeepgram ? dg.transcript : chunk.transcript;
	const interim = useDeepgram ? dg.interim : "";
	const micBlocked = !recSupported || !recSecure || recError === "not-allowed" || recError === "insecure" || recError === "unsupported";

	useEffect(() => {
		if (dg.error === "connection" || dg.error === "No se pudo conectar a Deepgram") setUseChunkFallback(true);
	}, [dg.error]);

	const liveText = [draft.trim(), transcript, interim].filter(Boolean).join(" ").trim();

	// --- Beat: suena en countdown y turno ---
	const beatPlayer = useBeatPlayer();
	const { play: playBeat, stop: stopBeat } = beatPlayer;
	useEffect(() => {
		if (config.beat && (phase === "countdown" || phase === "turn")) void playBeat(config.beat, 0.35);
		else stopBeat();
	}, [config.beat, phase, playBeat, stopBeat]);

	const { ensureActive } = media;
	useEffect(() => {
		if (phase === "countdown" || phase === "turn") void ensureActive(mediaRequirements);
	}, [phase, step, ensureActive, mediaRequirements]);

	// Palabras activas para el turno actual (tanda por tiempo/compás).
	const promptWords = useMemo(() => {
		if (phase !== "turn" && phase !== "countdown") return [];
		const role = phase === "countdown" ? roundStarter(1, 0) : activeRole;
		const round = phase === "countdown" ? 1 : current?.round ?? 1;
		const batches = wordBatchesForRole(wordPlan, role);
		if (batches.length === 0) return words;
		const startedAt = turnStartedAt ?? now;
		const segment =
			phase === "turn" && promptInterval
				? Math.min(batchesPerTurn - 1, Math.max(0, Math.floor((now - startedAt) / promptInterval)))
				: 0;
		const index = Math.max(0, (round - 1) * batchesPerTurn + segment);
		return batches[index] ?? [];
	}, [phase, activeRole, current?.round, wordPlan, words, turnStartedAt, now, promptInterval, batchesPerTurn]);

	const promptLabel =
		config.modality === "deconceptos"
			? "CONCEPTOS A DESARROLLAR"
			: config.modality === "palabras"
				? "PALABRAS QUE RIMAN"
				: config.modality === "hard" || config.modality === "easy"
					? "PALABRA ACTIVA"
					: "PALABRAS OBLIGATORIAS";

	const marksPromptUse = config.modality !== "deconceptos";
	const usedWords = useMemo(() => {
		if (!marksPromptUse || promptWords.length === 0) return [];
		const text = normalizeWords([...verses[activeRole], liveText].join(" "));
		return promptWords.map((w) => text.includes(normalizeWords(w).split(/\s+/).pop()!));
	}, [promptWords, verses, activeRole, liveText, marksPromptUse]);

	// --- Activar mic ---
	const armedTurn = useRef<number>(-1);
	const fallbackArmed = useRef<number>(-1);
	const submittedTurn = useRef<number>(-1);
	const startRecording = useCallback(
		(sourceStream?: MediaStream | null) => {
			recStart(undefined, promptWords.length > 0 ? promptWords : words, sourceStream);
		},
		[recStart, promptWords, words],
	);
	const activateMic = () => startRecording(media.stream.current);

	// El mic arranca YA en la cuenta atrás (no al iniciar el turno): así la
	// conexión a Deepgram tiene unos segundos para abrir —o caer al respaldo—
	// y el primer turno ya empieza escuchando, no "conectando".
	useEffect(() => {
		if (phase !== "countdown" && phase !== "turn") return;
		if (armedTurn.current === step) return;
		armedTurn.current = step;
		submittedTurn.current = -1;
		setDraft("");
		if (recSupported && recSecure) startRecording(media.stream.current);
	}, [phase, step, recSupported, recSecure, startRecording, media.stream]);

	// Si Deepgram se cae (cold start típico del primer turno), levantar el
	// grabador local de respaldo para este turno sin perder la escucha.
	useEffect(() => {
		if (!useChunkFallback) return;
		if (phase !== "countdown" && phase !== "turn") return;
		if (fallbackArmed.current === step) return;
		fallbackArmed.current = step;
		const deepgramText = [dg.transcript, dg.interim].filter(Boolean).join(" ").trim();
		if (deepgramText) setDraft((d) => [d.trim(), deepgramText].filter(Boolean).join(" "));
		if (chunkSupported && chunkSecure && !chunkListening) {
			chunkStart(undefined, promptWords.length > 0 ? promptWords : words, media.stream.current);
		}
	}, [
		useChunkFallback,
		phase,
		step,
		chunkSupported,
		chunkSecure,
		chunkListening,
		chunkStart,
		promptWords,
		words,
		dg.transcript,
		dg.interim,
		media.stream,
	]);

	// --- Transiciones de fase ---
	const callJudge = useCallback(
		async (finalVerses: { p1: string[]; p2: string[] }) => {
			const player = (name: string): BattleState["players"]["p1"] => ({
				name,
				sessionId: null,
				userId: null,
				isGuest: true,
				isBot: false,
				connected: true,
				ready: true,
				wantsRematch: false,
			});
			const state: BattleState = {
				battleId: `practice-${Date.now()}`,
				modality: config.modality,
				words,
				wordPlan,
				beat: config.beat,
				phase: "result",
				round: mod.rounds,
				totalRounds: mod.rounds,
				activeRole: null,
				turnStartedAt: null,
				deadline: null,
				players: { p1: player(config.name1), p2: player(config.name2) },
				verses: finalVerses,
				verdict: null,
				replicaCount: 0,
			};
			try {
				const res = await fetch(judgeUrl(), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(state),
				});
				if (!res.ok) throw new Error("judge");
				const data = (await res.json()) as { verdict?: Verdict };
				if (!data.verdict) throw new Error("verdict");
				setVerdict(data.verdict);
			} catch {
				setJudgeError("No se pudo contactar al juez. Revisá tu conexión.");
			}
			setPhase("result");
		},
		[config, words, wordPlan, mod.rounds],
	);

	const advance = useCallback(
		(finalVerses: { p1: string[]; p2: string[] }) => {
			stopBeat();
			if (step + 1 >= turns.length) {
				if (versus) {
					setPhase("judging");
					void callJudge(finalVerses);
				} else {
					setPhase("result");
				}
				return;
			}
			// Resetear los relojes para que la próxima cuenta atrás reciba un
			// deadline fresco (si no, el countdown hereda uno ya vencido).
			setTurnStartedAt(null);
			setDeadline(null);
			setStep((s) => s + 1);
			// Solo: encadena sin pasar el teléfono. Versus: pantalla de relevo.
			setPhase(versus ? "ready" : "countdown");
		},
		[step, turns.length, versus, callJudge, stopBeat],
	);

	const submit = useCallback(async () => {
		if (submittedTurn.current === step) return;
		submittedTurn.current = step;
		const voice = recSupported ? await recStop() : "";
		const text = [voice, draft.trim()].filter(Boolean).join(" ").trim();
		const finalVerses = { p1: [...verses.p1], p2: [...verses.p2] };
		finalVerses[activeRole][(current?.round ?? 1) - 1] = text;
		setVerses(finalVerses);
		setDraft("");
		advance(finalVerses);
	}, [step, recSupported, recStop, draft, verses, activeRole, current?.round, advance]);

	const startCountdown = useCallback(() => {
		void media.ensureActive(mediaRequirements);
		setPhase("countdown");
	}, [media, mediaRequirements]);

	// countdown → turn
	useEffect(() => {
		if (phase === "countdown" && deadline === null) {
			setDeadline(Date.now() + cdMs);
		}
	}, [phase, deadline, cdMs]);

	useEffect(() => {
		if (phase === "countdown" && remaining !== null && remaining <= 0) {
			setTurnStartedAt(Date.now());
			setDeadline(Date.now() + turnMs);
			setPhase("turn");
		}
	}, [phase, remaining, turnMs]);

	// turno: auto-cerrar al llegar a 0
	useEffect(() => {
		if (phase === "turn" && remaining !== null && remaining <= 0 && submittedTurn.current !== step) {
			void submit();
		}
	}, [phase, remaining, step, submit]);

	// al salir de countdown/turn limpiar deadline para la siguiente fase
	useEffect(() => {
		if (phase === "ready" || phase === "judging" || phase === "result") setDeadline(null);
	}, [phase]);

	const shownRemaining = remaining === null ? null : Math.min(remaining, phase === "turn" ? mod.turnDurationSec : 3);
	const countdownNum = remaining === null ? null : Math.min(remaining, 3);
	const localStream = media.stream.current;
	const hasLocalVideo = localStream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;

	// =========================== RENDER ===========================

	if (phase === "result") {
		return (
			<PracticeResult
				versus={versus}
				config={config}
				verses={verses}
				verdict={verdict}
				judgeError={judgeError}
				onRestart={onRestart}
				onExit={onExit}
			/>
		);
	}

	// Pantalla de relevo / inicio (gesto para audio + mic).
	if (phase === "ready") {
		const isFirst = step === 0;
		return (
			<div className="practice-overlay">
				<div className="arena-grain" />
				<div className="arena-vignette" />
				<div className="practice-relay">
					<div className="practice-relay-kicker">
						{versus ? (isFirst ? "ARRANCA LA PRÁCTICA" : "RELEVO · PASÁ EL TELÉFONO") : "TODO LISTO"}
					</div>
					<div className="practice-relay-name">{(activeName || "MC").toUpperCase()}</div>
					<div className="practice-relay-sub">
						RONDA {current?.round ?? 1}/{mod.rounds} · {mod.name.toUpperCase()}
						{config.beat ? ` · ${config.beat.name.toUpperCase()}` : ""}
					</div>
					<button onClick={startCountdown} className="btn-arena" style={{ fontSize: 22, padding: "18px 48px" }}>
						<span>{versus && !isFirst ? "ESTOY LISTO" : "EMPEZAR"}</span>
					</button>
				</div>
				<button onClick={onExit} className="btn-ghost" style={{ marginTop: 8 }}>
					SALIR
				</button>
			</div>
		);
	}

	// countdown / turn → cámara a pantalla completa
	const timerLow = shownRemaining !== null && shownRemaining <= 5;
	return (
		<div
			className={`practice-stage${config.beat && phase === "turn" ? " grooving" : ""}`}
			style={{ "--beat-period": `${(60 / (bpm ?? 90)).toFixed(3)}s` } as React.CSSProperties}
		>
			{localStream && hasLocalVideo ? (
				<video
					autoPlay
					muted
					playsInline
					ref={(el) => {
						if (el && el.srcObject !== localStream) el.srcObject = localStream;
					}}
					className="practice-video"
				/>
			) : (
				<div className="practice-video practice-no-signal">
					<div className="big">{config.useCamera ? "SIN CÁMARA" : "SOLO MIC"}</div>
				</div>
			)}
			<div className="arena-scanlines" />
			<div className="practice-vignette-fx" />

			{/* HUD superior */}
			<div className="practice-hud-top">
				<div className="practice-hud-name">
					<span className="arena-live-dot" style={{ margin: 0 }} />
					{(activeName || "MC").toUpperCase()}
				</div>
				<div className="practice-hud-round">
					{mod.name.toUpperCase()} · RONDA {current?.round ?? 1}/{mod.rounds}
				</div>
				<div className={`practice-timer${timerLow ? " low" : ""}`}>
					{phase === "turn" ? (shownRemaining === null ? "--" : `${shownRemaining}s`) : "·"}
				</div>
			</div>

			{/* Palabras */}
			{promptWords.length > 0 && (
				<div className={`prompt-zone${marksPromptUse ? "" : " concepts"} practice-prompt`}>
					<div className="prompt-label">{promptLabel}</div>
					<div className="prompt-word">
						{promptWords.map((w, i) => (
							<span key={w}>
								{i > 0 && <span className="pw-sep"> · </span>}
								<span className={`pw${marksPromptUse && usedWords[i] ? " used" : ""}`}>{w}</span>
							</span>
						))}
					</div>
				</div>
			)}

			{/* Countdown */}
			{phase === "countdown" && (
				<div className="battle-countdown">
					<div key={countdownNum ?? "ya"} className="battle-countdown-num punch">
						{countdownNum !== null && countdownNum > 0 ? countdownNum : "¡YA!"}
					</div>
					<div className="battle-countdown-starter">
						ABRE <span className="red">{(activeName || "MC").toUpperCase()}</span>
					</div>
				</div>
			)}

			{/* Transcripción en vivo */}
			{phase === "turn" && (
				<div className="practice-caption">
					<div className="practice-caption-line">
						{liveText ? <RhymeText text={liveText} /> : <span className="practice-caption-ghost">escuchando…</span>}
					</div>
				</div>
			)}

			{/* Controles del turno */}
			{phase === "turn" && (
				<div className="practice-controls">
					{!micBlocked ? (
						<>
							{(!listening || recError) && (
								<button onClick={activateMic} className="btn-ghost" style={{ fontSize: 11, padding: "10px 18px" }}>
									{recError ? "⚠ REINTENTAR MIC" : "🎤 ACTIVAR MIC"}
								</button>
							)}
							{listening && (
								<span className="practice-listening">
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
								<button onClick={activateMic} className="btn-ghost" style={{ fontSize: 11, padding: "10px 18px" }}>
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

			{/* Modo texto si el mic está bloqueado */}
			{phase === "turn" && micBlocked && (
				<div className="verse-draft-zone practice-draft">
					<div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--red)", marginBottom: 6 }}>
						{recError === "not-allowed" ? "MIC SIN PERMISO — MODO TEXTO" : "MODO TEXTO"}
					</div>
					<textarea
						autoFocus
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder="Escribí tu rima…"
						className="verse-draft"
					/>
				</div>
			)}

			<button onClick={onExit} className="btn-ghost practice-exit">
				SALIR
			</button>
		</div>
	);
}

// =========================== RESULT ===========================

function PracticeResult({
	versus,
	config,
	verses,
	verdict,
	judgeError,
	onRestart,
	onExit,
}: {
	versus: boolean;
	config: PracticeConfig;
	verses: { p1: string[]; p2: string[] };
	verdict: Verdict | null;
	judgeError: string | null;
	onRestart: () => void;
	onExit: () => void;
}) {
	// SOLO: recap de lo que rapeaste, sin juez.
	if (!versus) {
		const lines = verses.p1.filter((v) => v && v.trim());
		return (
			<div className="practice-overlay">
				<div className="arena-grain" />
				<div className="arena-vignette" />
				<div className="practice-result-card">
					<div className="judgment-kicker">PRÁCTICA TERMINADA</div>
					<div className="winner-name" style={{ color: "var(--bone)" }}>{(config.name1 || "TÚ").toUpperCase()}</div>
					<div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.22em", color: "var(--bone-dim)", textTransform: "uppercase", marginBottom: 12 }}>
						TU FREESTYLE, RONDA POR RONDA
					</div>
					{lines.length > 0 ? (
						<div className="practice-recap">
							{lines.map((v, i) => (
								<div key={i} className="practice-recap-line">
									<span className="practice-recap-num">{i + 1}</span>
									<RhymeText text={v} />
								</div>
							))}
						</div>
					) : (
						<p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--bone-dim)" }}>
							No se transcribió nada esta vez. Probá activar el micrófono.
						</p>
					)}
					<div style={{ display: "flex", gap: 16, marginTop: 20 }}>
						<button onClick={onRestart} className="btn-arena" style={{ fontSize: 18, padding: "14px 32px" }}>
							<span>OTRA VEZ</span>
						</button>
						<button onClick={onExit} className="btn-ghost">CONFIGURAR DE NUEVO</button>
					</div>
				</div>
			</div>
		);
	}

	// VERSUS: veredicto del juez.
	const draw = verdict?.winner === "draw";
	const winnerRole = !verdict || draw ? null : (verdict.winner as Role);
	const winnerName = winnerRole ? (winnerRole === "p1" ? config.name1 : config.name2).toUpperCase() : "RÉPLICA";

	return (
		<div className="practice-overlay">
			<div className="arena-grain" />
			<div className="arena-vignette" />
			<div className="practice-result-card">
				{!verdict ? (
					<>
						<div className="judgment-kicker">{judgeError ? "SIN VEREDICTO" : "EL JURADO DELIBERA"}</div>
						<p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--bone-dim)", maxWidth: 420, textAlign: "center" }}>
							{judgeError ?? "Evaluando la batalla…"}
						</p>
					</>
				) : (
					<>
						<div className="judgment-kicker">
							{draw ? "EMPATE TÉCNICO" : `GANA ${winnerName}`}
						</div>
						<div className="winner-name" style={{ color: draw ? "var(--bone-dim)" : "var(--red)" }}>
							{draw ? "RÉPLICA" : winnerName}
						</div>
						<div className="practice-votes">
							{verdict.judges.map((j) => {
								const label =
									j.vote === "replica"
										? "RÉPLICA"
										: ((j.vote === "p1" ? config.name1 : config.name2) || j.vote).toUpperCase();
								return (
									<span key={j.judge} className="practice-vote">
										JUEZ {j.judge}: <strong>{label}</strong>
									</span>
								);
							})}
						</div>

						{verdict.detail ? (
							<div className="practice-scoregrid">
								<div className={`result-score-card${verdict.winner === "p1" ? " winner" : ""}`}>
									<PlayerScore name={config.name1} total={verdict.scores.p1} pv={verdict.detail.p1} highlight={verdict.winner === "p1"} />
								</div>
								<div className={`result-score-card${verdict.winner === "p2" ? " winner" : ""}`}>
									<PlayerScore name={config.name2} total={verdict.scores.p2} pv={verdict.detail.p2} highlight={verdict.winner === "p2"} />
								</div>
							</div>
						) : (
							<div style={{ display: "flex", gap: 40, fontFamily: "var(--font-display)", fontSize: 32, textTransform: "uppercase", margin: "10px 0" }}>
								<div style={{ textAlign: "center" }}>
									<div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bone-dim)" }}>{config.name1}</div>
									{verdict.scores.p1}
								</div>
								<div style={{ color: "var(--bone-dim)", alignSelf: "center", fontSize: 20 }}>VS</div>
								<div style={{ textAlign: "center" }}>
									<div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bone-dim)" }}>{config.name2}</div>
									{verdict.scores.p2}
								</div>
							</div>
						)}

						{verdict.rationale && (
							<div className="practice-rationale">
								<span>EL JURADO</span>
								{verdict.rationale}
							</div>
						)}
					</>
				)}

				<div style={{ display: "flex", gap: 16, marginTop: 20 }}>
					<button onClick={onRestart} className="btn-arena" style={{ fontSize: 18, padding: "14px 32px" }}>
						<span>OTRA BATALLA</span>
					</button>
					<button onClick={onExit} className="btn-ghost">CONFIGURAR DE NUEVO</button>
				</div>
			</div>
		</div>
	);
}

function PlayerScore({ name, total, pv, highlight }: { name: string; total: number; pv: PlayerVerdict; highlight: boolean }) {
	return (
		<div>
			<div className={`crit-head${highlight ? " hl" : ""}`}>
				<span className="crit-name">{name}</span>
				<span className="crit-total">{total}</span>
			</div>
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
