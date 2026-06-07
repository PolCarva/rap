"use client";

import { MODALITIES, type BattleState, type Role } from "@rap/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlayerPanel } from "./PlayerPanel";
import { useDeepgramTranscription } from "./useDeepgramTranscription";
import type { MediaController } from "./useMediaStream";

interface Props {
	battle: BattleState;
	myRole: Role;
	opponentCaption: string;
	media: MediaController;
	onReady: () => void;
	onCaption: (text: string) => void;
	onSubmitVerse: (text: string) => void;
	onLeave: () => void;
}

/** Segundos restantes hasta un deadline epoch-ms (cronómetro autoritativo del DO). */
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
	onReady,
	onCaption,
	onSubmitVerse,
	onLeave,
}: Props) {
	const oppRole: Role = myRole === "p1" ? "p2" : "p1";
	const me = battle.players[myRole];
	const opp = battle.players[oppRole];
	const isMyTurn = battle.phase === "turn" && battle.activeRole === myRole;
	const remaining = useRemaining(battle.deadline);

	const {
		supported: recSupported,
		secure: recSecure,
		listening,
		error: recError,
		transcript,
		interim,
		start: recStart,
		stop: recStop,
	} = useDeepgramTranscription();

	const { stream, releaseAudio } = media;
	const [draft, setDraft] = useState(""); // fallback de tipeo si no hay voz
	const handledRound = useRef<number | null>(null);
	const submittedRound = useRef<number | null>(null);

	const liveText = `${transcript} ${interim}`.trim();

	// Arranca (o reintenta) el reconocimiento de voz. Libera primero el mic que
	// pueda estar reteniendo la cámara, para que Web Speech lo pueda usar.
	const activateMic = useCallback(() => {
		releaseAudio();
		recStart((full) => onCaption(full));
	}, [releaseAudio, recStart, onCaption]);

	// Al empezar mi turno: arrancar reconocimiento de voz (o limpiar el textarea).
	useEffect(() => {
		if (!isMyTurn) return;
		if (handledRound.current === battle.round) return;
		handledRound.current = battle.round;
		setDraft("");
		if (recSupported && recSecure) activateMic();
	}, [isMyTurn, battle.round, recSupported, recSecure, activateMic]);

	const submit = useCallback(() => {
		if (submittedRound.current === battle.round) return;
		submittedRound.current = battle.round;
		const text = recSupported ? recStop() : draft;
		onSubmitVerse(text);
		setDraft("");
	}, [battle.round, recSupported, recStop, draft, onSubmitVerse]);

	// Seguro: si se acaba el tiempo y no envié, mando lo transcripto hasta ahora.
	useEffect(() => {
		if (isMyTurn && remaining !== null && remaining <= 1 && submittedRound.current !== battle.round) {
			submit();
		}
	}, [isMyTurn, remaining, battle.round, submit]);

	const handleDraft = (text: string) => {
		setDraft(text);
		onCaption(text);
	};

	const mod = MODALITIES[battle.modality];

	return (
		<div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-6">
			{/* Encabezado */}
			<div className="flex items-center justify-between">
				<div>
					<span className="text-sm font-bold text-fuchsia-300">{mod.name}</span>
					<span className="ml-2 text-xs text-white/40">
						Ronda {Math.max(1, battle.round)}/{battle.totalRounds}
					</span>
				</div>
				<button onClick={onLeave} className="text-xs text-white/40 hover:text-red-300">
					Abandonar
				</button>
			</div>

			{battle.words.length > 0 && (
				<div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2 text-sm">
					<span className="text-amber-300/80">Palabras obligatorias: </span>
					{battle.words.map((w) => (
						<span key={w} className="mr-2 font-semibold text-amber-200">
							{w}
						</span>
					))}
				</div>
			)}

			{/* Paneles enfrentados */}
			<div className="relative flex flex-col items-stretch gap-3 sm:flex-row">
				<PlayerPanel
					player={me}
					isSelf
					isActive={battle.phase === "turn" && battle.activeRole === myRole}
					caption={isMyTurn ? liveText : ""}
					verses={battle.verses[myRole]}
					stream={stream.current}
				/>
				<div className="flex items-center justify-center text-2xl font-black text-white/30 sm:flex-col">
					VS
				</div>
				<PlayerPanel
					player={opp}
					isSelf={false}
					isActive={battle.phase === "turn" && battle.activeRole === oppRole}
					caption={battle.phase === "turn" && battle.activeRole === oppRole ? opponentCaption : ""}
					verses={battle.verses[oppRole]}
					mirror
				/>

				{/* Overlay de cuenta atrás */}
				{battle.phase === "countdown" && (
					<div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
						<div className="text-7xl font-black text-white animate-battle-pulse">
							{remaining !== null && remaining > 0 ? remaining : "¡YA!"}
						</div>
					</div>
				)}
			</div>

			{/* Controles según fase */}
			<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
				{battle.phase === "lobby" && (
					<p className="text-center text-sm text-white/50">Esperando a que se conecte el rival…</p>
				)}

				{battle.phase === "ready_check" && (
					<div className="flex flex-col items-center gap-3">
						<p className="text-sm text-white/60">Probá tu cámara y micrófono. Cuando estés, dale listo.</p>
						<button
							onClick={onReady}
							disabled={me.ready}
							className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-8 py-3 font-bold text-black disabled:opacity-40"
						>
							{me.ready ? "Esperando al rival…" : "Estoy listo"}
						</button>
					</div>
				)}

				{battle.phase === "turn" && isMyTurn && (
					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between text-sm">
							<span className="flex items-center gap-2 font-bold text-fuchsia-300">
								¡Tu turno! Rapeá 🔥
								{recSupported && listening && (
									<span className="flex items-center gap-1 text-xs font-normal text-red-400">
										<span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> escuchando
									</span>
								)}
							</span>
							{remaining !== null && (
								<span className={`font-mono ${remaining <= 5 ? "text-red-400" : "text-white/60"}`}>{remaining}s</span>
							)}
						</div>

						{recSupported && recSecure ? (
							<>
								<div className="min-h-24 rounded-lg border border-fuchsia-400/40 bg-black/40 px-3 py-2 text-lg leading-relaxed">
									{liveText ? (
										<>
											{transcript && <span>{transcript} </span>}
											<span className="text-white/50">{interim}</span>
										</>
									) : recError ? (
										<span className="text-red-300">
											No se pudo transcribir ({recError}). Revisá el micrófono / la API key de Deepgram y tocá
											“Activar micrófono”.
										</span>
									) : listening ? (
										<span className="text-white/40">🎙️ Escuchando… empezá a rapear</span>
									) : (
										<span className="text-white/30">Tocá “Activar micrófono” para empezar 🎤</span>
									)}
								</div>
								<div className="flex items-center justify-end gap-2">
									{(!listening || recError) && (
										<button
											onClick={activateMic}
											className="rounded-lg border border-fuchsia-400/50 px-4 py-2 text-sm font-medium text-fuchsia-200 hover:bg-fuchsia-500/10"
										>
											🎤 Activar micrófono
										</button>
									)}
									<button
										onClick={submit}
										className="rounded-lg bg-fuchsia-500 px-5 py-2 text-sm font-bold text-black hover:brightness-110"
									>
										Terminar turno
									</button>
								</div>
							</>
						) : (
							<>
								<p className="text-xs text-amber-300/80">
									{!recSupported
										? "Tu navegador no soporta transcripción por voz (probá Chrome/Edge); escribí tu rima."
										: "Los subtítulos por voz necesitan localhost o HTTPS (estás en una IP); escribí tu rima."}
								</p>
								<textarea
									autoFocus
									value={draft}
									onChange={(e) => handleDraft(e.target.value)}
									placeholder="Escribí tu rima…"
									className="h-24 w-full resize-none rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-fuchsia-400/60"
								/>
								<button
									onClick={submit}
									className="self-end rounded-lg bg-fuchsia-500 px-5 py-2 text-sm font-bold text-black hover:brightness-110"
								>
									Enviar verso
								</button>
							</>
						)}
					</div>
				)}

				{battle.phase === "turn" && !isMyTurn && (
					<div className="text-center">
						<p className="text-sm text-white/60">
							Turno de <span className="font-bold text-cyan-300">{opp.name}</span>
							{remaining !== null && <span className="ml-2 font-mono text-white/40">{remaining}s</span>}
						</p>
						{opponentCaption && <p className="mt-2 text-lg text-cyan-200">{opponentCaption}</p>}
					</div>
				)}

				{battle.phase === "judging" && (
					<p className="text-center text-sm text-white/60 animate-battle-pulse">⚖️ El juez está evaluando…</p>
				)}

				{battle.phase === "result" && battle.verdict && (
					<Result battle={battle} myRole={myRole} onLeave={onLeave} />
				)}

				{battle.phase === "aborted" && (
					<div className="flex flex-col items-center gap-3">
						<p className="text-sm text-red-300">El rival abandonó la batalla.</p>
						<button onClick={onLeave} className="rounded-lg border border-white/15 px-5 py-2 text-sm hover:bg-white/5">
							Volver
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function Result({ battle, myRole, onLeave }: { battle: BattleState; myRole: Role; onLeave: () => void }) {
	const v = battle.verdict!;
	const youWon = v.winner === myRole;
	const draw = v.winner === "draw";
	const title = draw ? "EMPATE" : youWon ? "¡GANASTE!" : "Perdiste";
	const color = draw ? "text-white" : youWon ? "text-emerald-400" : "text-red-400";

	return (
		<div className="flex flex-col items-center gap-4 text-center">
			<h2 className={`text-4xl font-black ${color}`}>{title}</h2>
			<div className="flex gap-8 text-sm">
				<div>
					<div className="text-white/40">{battle.players.p1.name}</div>
					<div className="text-2xl font-bold">{v.scores.p1}</div>
				</div>
				<div className="self-center text-white/20">vs</div>
				<div>
					<div className="text-white/40">{battle.players.p2.name}</div>
					<div className="text-2xl font-bold">{v.scores.p2}</div>
				</div>
			</div>
			<p className="max-w-lg text-xs text-white/50">{v.rationale}</p>
			<button
				onClick={onLeave}
				className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-6 py-3 font-bold text-black"
			>
				Otra batalla
			</button>
		</div>
	);
}
