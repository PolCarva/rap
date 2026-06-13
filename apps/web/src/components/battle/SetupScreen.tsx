"use client";

import { MODALITIES, MODALITY_IDS, SYNTH_BEATS, type Beat, type ModalityId } from "@rap/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayerCounts } from "@/components/usePlayerCounts";
import { useBeatPlayer } from "./useBeatPlayer";
import type { MediaController } from "./useMediaStream";
import type { RapSession } from "./useRapSession";

interface Props {
	error: string | null;
	initialModality: ModalityId;
	media: MediaController;
	session: RapSession;
	onSearch: (
		identity: { isGuest: true; name: string } | { isGuest: false; name: string; email: string | null },
		modality: ModalityId,
		beatId: string | null,
		devBot: boolean,
	) => void;
}

const DIFF_LABELS: Record<string, string> = {
	"4x4": "NIVEL: MEDIO",
	"minuto-libre": "NIVEL: ABIERTO",
	palabras: "NIVEL: RIMAS",
	hard: "NIVEL: HARD",
	easy: "NIVEL: EASY",
	deconceptos: "NIVEL: CONCEPTUAL",
};

export function SetupScreen({ error, initialModality, media, session, onSearch }: Props) {
	const counts = usePlayerCounts();
	const [modality, setModality] = useState<ModalityId>(initialModality);
	const [beats, setBeats] = useState<Beat[]>([]);
	const [beatId, setBeatId] = useState<string>("random");
	const [beatState, setBeatState] = useState<"loading" | "ready" | "empty">("loading");
	const beatPreview = useBeatPlayer();
	const [asGuest, setAsGuest] = useState(session.isGuest);
	const [accountAka, setAccountAka] = useState(session.isGuest ? "" : session.name);
	const [guestAka, setGuestAka] = useState(session.isGuest ? session.name : "");
	const [devBot, setDevBot] = useState(false);
	const [launchToast, setLaunchToast] = useState<{ title: string; body: string } | null>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const toastTimer = useRef<number | null>(null);

	const isLoggedIn = !session.isGuest && !!session.userId;
	const showDevBot = process.env.NODE_ENV === "development";

	useEffect(() => {
		setAsGuest(!isLoggedIn);
		if (isLoggedIn) setAccountAka(session.name);
		if (session.isGuest) setGuestAka(session.name);
	}, [isLoggedIn, session.isGuest, session.name]);

	useEffect(() => {
		setModality(initialModality);
	}, [initialModality]);

	useEffect(
		() => () => {
			if (toastTimer.current) window.clearTimeout(toastTimer.current);
		},
		[],
	);

	useEffect(() => {
		let active = true;
		fetch("/api/beats")
			.then((r) => r.json() as Promise<{ beats: Beat[] }>)
			.then(({ beats }) => {
				if (!active) return;
				setBeats(beats);
				setBeatState(beats.length > 0 ? "ready" : "empty");
			})
			.catch(() => {
				if (active) setBeatState("empty");
			});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (media.status === "ready" && videoRef.current && media.stream.current) {
			videoRef.current.srcObject = media.stream.current;
		}
	}, [media.status, media.stream]);

	const currentAka = asGuest ? guestAka : accountAka;
	const canUseAccount = isLoggedIn && !asGuest;
	const canEnter = currentAka.trim().length > 0;
	const stream = media.stream.current;
	const hasCamera = media.status === "ready" && !!stream?.getVideoTracks().some((track) => track.readyState === "live");
	const hasMicrophone = media.status === "ready" && !!stream?.getAudioTracks().some((track) => track.readyState === "live");
	const mediaState = { hasCamera, hasMicrophone, ready: hasCamera && hasMicrophone };
	// Beats de la DB (backoffice) + los sintetizados de la casa: siempre hay pista.
	const allBeats = useMemo(() => [...beats, ...SYNTH_BEATS], [beats]);
	const selectedBeat = useMemo(() => allBeats.find((beat) => beat.id === beatId) ?? null, [allBeats, beatId]);

	const togglePreview = (beat: Beat) => {
		if (beatPreview.playing === beat.id) beatPreview.stop();
		else void beatPreview.play(beat, 0.5);
	};

	const showLaunchToast = (title: string, body: string) => {
		if (toastTimer.current) window.clearTimeout(toastTimer.current);
		setLaunchToast({ title, body });
		toastTimer.current = window.setTimeout(() => setLaunchToast(null), 4600);
	};

	const permissionLabel = (ready: boolean) => {
		if (ready) return "LIVE";
		if (media.status === "requesting") return "PIDIENDO";
		if (media.status === "denied") return "BLOQUEADO";
		return "PENDIENTE";
	};

	const handleSearch = () => {
		const name = currentAka.trim();
		const selectedBeatId = beatId === "random" ? null : beatId;
		if (!name) {
			showLaunchToast("FALTA TU AKA", "Escribí tu AKA de guerra antes de buscar rival.");
			return;
		}
		if (!mediaState.ready) {
			const missing = [
				!mediaState.hasMicrophone ? "micrófono" : null,
				!mediaState.hasCamera ? "cámara" : null,
			].filter(Boolean);
			const body =
				media.status === "denied"
					? `El navegador bloqueó ${missing.join(" + ")}. Revisá permisos y activá la señal en el paso 04.`
					: media.status === "requesting"
						? "El navegador todavía está pidiendo permisos. Aceptá micrófono y cámara para entrar."
						: `Activá ${missing.join(" + ")} en el paso 04 antes de buscar rival.`;
			showLaunchToast(`FALTA ${missing.map((item) => item!.toUpperCase()).join(" + ")}`, body);
			return;
		}
		beatPreview.stop();
		if (canUseAccount) {
			onSearch({ isGuest: false, name, email: session.email }, modality, selectedBeatId, showDevBot && devBot);
		} else {
			onSearch({ isGuest: true, name }, modality, selectedBeatId, showDevBot && devBot);
		}
	};

	const launchSummary = () => {
		if (!canEnter) return "FALTA TU AKA DE GUERRA";
		if (!mediaState.ready) {
			const missing = [
				!mediaState.hasMicrophone ? "MIC" : null,
				!mediaState.hasCamera ? "CÁMARA" : null,
			].filter(Boolean);
			return `ACTIVÁ ${missing.join(" + ")} PARA BUSCAR RIVAL`;
		}
		const m = MODALITIES[modality];
		const beat = selectedBeat ? selectedBeat.name : beatId === "random" ? "BEAT RANDOM" : "SIN BEAT";
		const rank = canUseAccount ? "RANKEADA" : "INVITADO";
		const rival = showDevBot && devBot ? "BOT DEV" : rank;
		return `${currentAka.toUpperCase()} · ${m.name.toUpperCase()} · ${beat.toUpperCase()} · ${rival}`;
	};

	return (
		<div
			style={{
				position: "relative",
				zIndex: 10,
				minHeight: "100vh",
				maxWidth: 1180,
				margin: "0 auto",
				padding: "110px 32px 80px",
				display: "flex",
				flexDirection: "column",
				gap: 46,
				overflowY: "auto",
			}}
		>
			<div className="config-page-head">
				<div className="config-kicker">PASO PREVIO AL COMBATE</div>
				<h1 className="config-h1">
					ARMA TU <em>BATALLA</em>
				</h1>
			</div>

			<section className={`config-step${canEnter ? " done" : ""}`}>
				<div className="config-step-num">01</div>
				<div style={{ width: "100%" }}>
					<h2 className="config-step-title">Identidad</h2>
					<div className="config-step-hint">Tu AKA de perfil aparece listo; invitado no mueve stats ni ELO</div>

					{isLoggedIn && (
						<div className="identity-switch" role="tablist" aria-label="Tipo de entrada">
							<button className={!asGuest ? "active" : ""} onClick={() => setAsGuest(false)}>
								Cuenta
							</button>
							<button className={asGuest ? "active" : ""} onClick={() => setAsGuest(true)}>
								Invitado
							</button>
						</div>
					)}

					<div style={{ maxWidth: 460 }}>
						<input
							className="aka-input"
							value={currentAka}
							onChange={(e) => (asGuest ? setGuestAka(e.target.value.toUpperCase()) : setAccountAka(e.target.value.toUpperCase()))}
							maxLength={30}
							placeholder={isLoggedIn && !asGuest ? "AKA PARA ESTA BATALLA" : "ESCRIBE TU AKA"}
							autoComplete="off"
							spellCheck={false}
						/>
						<div className={`rank-note${canUseAccount ? " ranked" : ""}`}>
							{canUseAccount ? "CUENTA ACTIVA · ESTA BATALLA CUENTA PARA TU ELO" : "MODO INVITADO · NO CUENTA PARA STATS"}
						</div>
					</div>
				</div>
			</section>

			<section className="config-step done">
				<div className="config-step-num">02</div>
				<div>
					<h2 className="config-step-title">Modo de batalla</h2>
					<div className="config-step-hint">Cada modo cambia las palabras, el tempo y la presión</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
						{MODALITY_IDS.map((id) => {
							const m = MODALITIES[id];
							return (
								<button key={id} onClick={() => setModality(id)} className={`mode-card${modality === id ? " sel" : ""}`}>
									<div className="mode-card-name">{m.name}</div>
									<div className="mode-card-desc">{m.description}</div>
									<div className="mode-card-meta">
										<span>
											{m.turnBars ? `${m.rounds} x ${m.turnBars} compases` : `${m.rounds} x ~${m.turnDurationSec}s`}
										</span>
										<span className="mode-card-diff">{DIFF_LABELS[id] ?? "MODO"}</span>
									</div>
									{(counts.byModality[id] ?? 0) > 0 && (
										<div className="mode-live">
											<span />
											{counts.byModality[id]} BUSCANDO
										</div>
									)}
								</button>
							);
						})}
					</div>
				</div>
			</section>

			<section className="config-step done">
				<div className="config-step-num">03</div>
				<div style={{ width: "100%" }}>
					<h2 className="config-step-title">Beat</h2>
					<div className="config-step-hint">La pista elegida suena en los turnos de ambos MCs</div>
					<div className="beat-grid">
						<div
							role="button"
							tabIndex={0}
							className={`beat-card${beatId === "random" ? " sel" : ""}`}
							onClick={() => setBeatId("random")}
							onKeyDown={(e) => e.key === "Enter" && setBeatId("random")}
						>
							<div className="beat-card-name">Random</div>
							<div className="beat-card-meta">
								{beatState === "loading" ? "CARGANDO LISTA" : `${allBeats.length} BEATS EN ROTACIÓN`}
							</div>
						</div>
						{allBeats.map((beat) => (
							<div
								role="button"
								tabIndex={0}
								key={beat.id}
								className={`beat-card${beatId === beat.id ? " sel" : ""}`}
								onClick={() => setBeatId(beat.id)}
								onKeyDown={(e) => e.key === "Enter" && setBeatId(beat.id)}
							>
								<div className="beat-card-name">{beat.name}</div>
								<div className="beat-card-meta">
									{beat.producer ?? "BACKOFFICE"} {beat.bpm ? `· ${beat.bpm} BPM` : ""}
								</div>
								<button
									type="button"
									className={`beat-preview-btn${beatPreview.playing === beat.id ? " on" : ""}`}
									aria-label={beatPreview.playing === beat.id ? "Parar preescucha" : "Preescuchar beat"}
									onClick={(e) => {
										e.stopPropagation();
										togglePreview(beat);
									}}
								>
									{beatPreview.playing === beat.id ? "■" : "▶"}
								</button>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className={`config-step${mediaState.ready ? " done" : ""}`}>
				<div className="config-step-num">04</div>
				<div>
					<h2 className="config-step-title">Mic + Cámara</h2>
					<div className="config-step-hint">Sin señal no hay batalla</div>
					<div className="media-setup-grid">
						<div className="cam-box">
							{mediaState.hasCamera ? (
								<video ref={videoRef} autoPlay muted playsInline />
							) : (
								<div className="cam-no-signal">
									<div className="big">SIN SEÑAL</div>
									<div>ESPERANDO PERMISOS DE CÁMARA</div>
								</div>
							)}
							{mediaState.hasCamera && (
								<div className="cam-preview-label">
									<span className="arena-live-dot" style={{ margin: 0 }} />
									PREVIEW
								</div>
							)}
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
							<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
								<div className={`perm-pill${mediaState.hasCamera ? " ok" : ""}`}>
									CÁMARA <span className="perm-state">{permissionLabel(mediaState.hasCamera)}</span>
								</div>
								<div className={`perm-pill${mediaState.hasMicrophone ? " ok" : ""}`}>
									MICRÓFONO <span className="perm-state">{permissionLabel(mediaState.hasMicrophone)}</span>
								</div>
							</div>
							{media.status === "ready" ? (
								<button onClick={media.stop} className="btn-ghost" style={{ alignSelf: "flex-start" }}>
									APAGAR SEÑAL
								</button>
							) : (
								<button
									onClick={media.start}
									disabled={media.status === "requesting"}
									className="btn-arena"
									style={{ alignSelf: "flex-start", padding: "16px 34px", fontSize: 17 }}
								>
									<span>{media.status === "requesting" ? "PIDIENDO PERMISOS" : "ACTIVAR MIC + CÁMARA"}</span>
								</button>
							)}
							{mediaState.hasMicrophone && (
								<div>
									<div className="mic-label">NIVEL MIC</div>
									<div className="mic-meter">
										<div style={{ width: `${Math.round(media.audioLevel * 100)}%` }} />
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</section>

			<section className="launch-panel">
				{error && <p className="launch-error">{error}</p>}
				{launchToast && (
					<div className="launch-toast" role="alert" aria-live="assertive">
						<strong>{launchToast.title}</strong>
						<span>{launchToast.body}</span>
					</div>
				)}
				{showDevBot && (
					<div className="identity-switch" role="tablist" aria-label="Rival de prueba">
						<button className={!devBot ? "active" : ""} onClick={() => setDevBot(false)}>
							Rival real
						</button>
						<button className={devBot ? "active" : ""} onClick={() => setDevBot(true)}>
							Bot dev
						</button>
					</div>
				)}
				<button
					data-needs-check={!canEnter || !mediaState.ready ? "true" : undefined}
					onClick={handleSearch}
					className={`btn-arena${canEnter && mediaState.ready ? "" : " needs-check"}`}
					style={{ fontSize: "clamp(22px, 2.4vw, 32px)", padding: "22px 64px" }}
				>
					<span>BUSCAR RIVAL</span>
				</button>
				<div className="launch-summary">{launchSummary()}</div>
			</section>
		</div>
	);
}
