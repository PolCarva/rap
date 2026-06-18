"use client";

import { MODALITIES, MODALITY_IDS, SYNTH_BEATS, type Beat, type ModalityId } from "@rap/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { MediaDevicePicker } from "@/components/battle/MediaDevicePicker";
import { useBeatPlayer } from "@/components/battle/useBeatPlayer";
import type { MediaController } from "@/components/battle/useMediaStream";

export type PracticeMode = "solo" | "versus";

export interface PracticeConfig {
	mode: PracticeMode;
	modality: ModalityId;
	beat: Beat | null;
	name1: string;
	name2: string;
	useCamera: boolean;
}

interface Props {
	initialModality: ModalityId;
	media: MediaController;
	onStart: (config: PracticeConfig) => void;
}

const DIFF_LABELS: Record<string, string> = {
	"4x4": "NIVEL: MEDIO",
	"minuto-libre": "NIVEL: ABIERTO",
	palabras: "NIVEL: RIMAS",
	hard: "NIVEL: HARD",
	easy: "NIVEL: EASY",
	deconceptos: "NIVEL: CONCEPTUAL",
};

export function PracticeSetup({ initialModality, media, onStart }: Props) {
	const [mode, setMode] = useState<PracticeMode>("solo");
	const [modality, setModality] = useState<ModalityId>(initialModality);
	const [beats, setBeats] = useState<Beat[]>([]);
	const [beatId, setBeatId] = useState<string>("random");
	const [beatState, setBeatState] = useState<"loading" | "ready" | "empty">("loading");
	const [name1, setName1] = useState("RAPERO 1");
	const [name2, setName2] = useState("RAPERO 2");
	const [useCamera, setUseCamera] = useState(true);
	const [toast, setToast] = useState<string | null>(null);
	const beatPreview = useBeatPlayer();
	const videoRef = useRef<HTMLVideoElement>(null);
	const toastTimer = useRef<number | null>(null);
	const mediaRequirements = useMemo(() => ({ audio: true, video: useCamera }), [useCamera]);

	useEffect(() => setModality(initialModality), [initialModality]);

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
		const video = videoRef.current;
		if (!video) return;
		const previewStream = media.stream.current;
		const hasLiveVideo = previewStream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
		video.srcObject = media.status === "ready" && hasLiveVideo ? previewStream : null;
	}, [media.status, media.stream, media.version]);

	useEffect(
		() => () => {
			if (toastTimer.current) window.clearTimeout(toastTimer.current);
		},
		[],
	);

	const allBeats = useMemo(() => [...beats, ...SYNTH_BEATS], [beats]);

	const stream = media.stream.current;
	const hasCamera = media.status === "ready" && !!stream?.getVideoTracks().some((t) => t.readyState === "live");
	const hasMicrophone = media.status === "ready" && !!stream?.getAudioTracks().some((t) => t.readyState === "live");
	const signalReady = hasMicrophone && (!useCamera || hasCamera);

	const showToast = (msg: string) => {
		if (toastTimer.current) window.clearTimeout(toastTimer.current);
		setToast(msg);
		toastTimer.current = window.setTimeout(() => setToast(null), 4200);
	};

	const togglePreview = (beat: Beat) => {
		if (beatPreview.playing === beat.id) beatPreview.stop();
		else void beatPreview.play(beat, 0.5);
	};

	const setCameraMode = (nextUseCamera: boolean) => {
		setUseCamera(nextUseCamera);
		if (media.status === "ready") void media.start({ audio: true, video: nextUseCamera });
	};

	const permissionLabel = (ready: boolean) => {
		if (ready) return "LIVE";
		if (media.status === "requesting") return "PIDIENDO";
		if (media.status === "denied") return "BLOQUEADO";
		return "PENDIENTE";
	};

	const handleStart = () => {
		const n1 = name1.trim() || "RAPERO 1";
		const n2 = name2.trim() || "RAPERO 2";
		if (!signalReady) {
			const missing = [!hasMicrophone ? "micrófono" : null, useCamera && !hasCamera ? "cámara" : null].filter(Boolean);
			showToast(`Activá ${missing.join(" + ")} en el paso 05 para practicar.`);
			return;
		}
		beatPreview.stop();
		const beat = beatId === "random"
			? allBeats[Math.floor(Math.random() * allBeats.length)] ?? null
			: allBeats.find((b) => b.id === beatId) ?? null;
		onStart({ mode, modality, beat, name1: n1, name2: n2, useCamera });
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
				<div className="config-kicker">ENTRENÁ SIN RIVAL · UN SOLO DISPOSITIVO</div>
				<h1 className="config-h1">
					MODO <em>PRÁCTICA</em>
				</h1>
				<p style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.14em", color: "var(--bone-dim)", textTransform: "uppercase", marginTop: 8 }}>
					No competís contra nadie online. Necesitás internet solo para el juez y la transcripción.
				</p>
			</div>

			{/* 01 — Modo de práctica */}
			<section className="config-step done">
				<div className="config-step-num">01</div>
				<div style={{ width: "100%" }}>
					<h2 className="config-step-title">¿Cómo querés practicar?</h2>
					<div className="config-step-hint">Solo para entrenar libre, o de a dos en el mismo teléfono por turnos</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
						<button onClick={() => setMode("solo")} className={`mode-card${mode === "solo" ? " sel" : ""}`}>
							<div className="mode-card-name">Solo</div>
							<div className="mode-card-desc">Palabras, tiempo y transcripción en vivo. Entrená sin presión, con cámara o solo mic.</div>
							<div className="mode-card-meta">
								<span>1 MC</span>
								<span className="mode-card-diff">SIN JUEZ</span>
							</div>
						</button>
						<button onClick={() => setMode("versus")} className={`mode-card${mode === "versus" ? " sel" : ""}`}>
							<div className="mode-card-name">De a dos</div>
							<div className="mode-card-desc">Como una batalla, pero los dos usan este mismo dispositivo. Se turnan el teléfono y al final el juez decide quién gana.</div>
							<div className="mode-card-meta">
								<span>2 MCS · MISMO EQUIPO</span>
								<span className="mode-card-diff">CON JUEZ</span>
							</div>
						</button>
					</div>
				</div>
			</section>

			{/* 02 — Nombres */}
			<section className="config-step done">
				<div className="config-step-num">02</div>
				<div style={{ width: "100%" }}>
					<h2 className="config-step-title">{mode === "solo" ? "Tu AKA" : "Los dos AKA"}</h2>
					<div className="config-step-hint">
						{mode === "solo" ? "Aparece en pantalla mientras rapeás" : "El juez nombra a cada MC con estos AKA"}
					</div>
					<div style={{ display: "flex", gap: 16, flexWrap: "wrap", maxWidth: 760 }}>
						<input
							className="aka-input"
							value={name1}
							onChange={(e) => setName1(e.target.value.toUpperCase())}
							maxLength={30}
							placeholder={mode === "solo" ? "ESCRIBE TU AKA" : "AKA RAPERO 1"}
							autoComplete="off"
							spellCheck={false}
							style={{ flex: "1 1 260px" }}
						/>
						{mode === "versus" && (
							<input
								className="aka-input"
								value={name2}
								onChange={(e) => setName2(e.target.value.toUpperCase())}
								maxLength={30}
								placeholder="AKA RAPERO 2"
								autoComplete="off"
								spellCheck={false}
								style={{ flex: "1 1 260px" }}
							/>
						)}
					</div>
				</div>
			</section>

			{/* 03 — Modo de batalla */}
			<section className="config-step done">
				<div className="config-step-num">03</div>
				<div>
					<h2 className="config-step-title">Modo de batalla</h2>
					<div className="config-step-hint">Define palabras, tempo y cantidad de turnos</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
						{MODALITY_IDS.map((id) => {
							const m = MODALITIES[id];
							return (
								<button key={id} onClick={() => setModality(id)} className={`mode-card${modality === id ? " sel" : ""}`}>
									<div className="mode-card-name">{m.name}</div>
									<div className="mode-card-desc">{m.description}</div>
									<div className="mode-card-meta">
										<span>{m.turnBars ? `${m.rounds} x ${m.turnBars} compases` : `${m.rounds} x ~${m.turnDurationSec}s`}</span>
										<span className="mode-card-diff">{DIFF_LABELS[id] ?? "MODO"}</span>
									</div>
								</button>
							);
						})}
					</div>
				</div>
			</section>

			{/* 04 — Beat */}
			<section className="config-step done">
				<div className="config-step-num">04</div>
				<div style={{ width: "100%" }}>
					<h2 className="config-step-title">Beat</h2>
					<div className="config-step-hint">La pista suena en cada turno</div>
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

			{/* 05 — Señal */}
			<section className={`config-step${signalReady ? " done" : ""}`}>
				<div className="config-step-num">05</div>
				<div>
					<h2 className="config-step-title">Señal de práctica</h2>
					<div className="config-step-hint">Podés usar cámara o entrenar solo con micrófono</div>
					<div className="media-setup-grid">
						<div className="cam-box">
							{useCamera && hasCamera ? (
								<video ref={videoRef} autoPlay muted playsInline />
							) : (
								<div className="cam-no-signal">
									<div className="big">{useCamera ? "SIN SEÑAL" : "SOLO MIC"}</div>
									<div>{useCamera ? "ESPERANDO PERMISOS DE CÁMARA" : "CÁMARA DESACTIVADA"}</div>
								</div>
							)}
							{useCamera && hasCamera && (
								<div className="cam-preview-label">
									<span className="arena-live-dot" style={{ margin: 0 }} />
									PREVIEW
								</div>
							)}
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
							<div className="identity-switch" role="tablist" aria-label="Tipo de señal">
								<button className={useCamera ? "active" : ""} onClick={() => setCameraMode(true)}>
									Mic + cámara
								</button>
								<button className={!useCamera ? "active" : ""} onClick={() => setCameraMode(false)}>
									Solo mic
								</button>
							</div>
							<MediaDevicePicker media={media} requirements={mediaRequirements} />
							<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
								<div className={`perm-pill${!useCamera || hasCamera ? " ok" : ""}`}>
									CÁMARA <span className="perm-state">{useCamera ? permissionLabel(hasCamera) : "OFF"}</span>
								</div>
								<div className={`perm-pill${hasMicrophone ? " ok" : ""}`}>
									MICRÓFONO <span className="perm-state">{permissionLabel(hasMicrophone)}</span>
								</div>
							</div>
							{media.status === "ready" ? (
								<button onClick={media.stop} className="btn-ghost" style={{ alignSelf: "flex-start" }}>
									APAGAR SEÑAL
								</button>
							) : (
								<button
									onClick={() => void media.start(mediaRequirements)}
									disabled={media.status === "requesting"}
									className="btn-arena"
									style={{ alignSelf: "flex-start", padding: "16px 34px", fontSize: 17 }}
								>
									<span>
										{media.status === "requesting"
											? "PIDIENDO PERMISOS"
											: useCamera
												? "ACTIVAR MIC + CÁMARA"
												: "ACTIVAR MIC"}
									</span>
								</button>
							)}
							{hasMicrophone && (
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
				{toast && (
					<div className="launch-toast" role="alert" aria-live="assertive">
						<strong>FALTA SEÑAL</strong>
						<span>{toast}</span>
					</div>
				)}
				<button
					onClick={handleStart}
					className={`btn-arena${signalReady ? "" : " needs-check"}`}
					style={{ fontSize: "clamp(22px, 2.4vw, 32px)", padding: "22px 64px" }}
				>
					<span>EMPEZAR PRÁCTICA</span>
				</button>
				<div className="launch-summary">
					{signalReady
						? `${mode === "solo" ? "SOLO" : "DE A DOS"} · ${MODALITIES[modality].name.toUpperCase()} · ${
								beatId === "random" ? "BEAT RANDOM" : (allBeats.find((b) => b.id === beatId)?.name ?? "SIN BEAT").toUpperCase()
							} · ${useCamera ? "MIC + CÁMARA" : "SOLO MIC"}`
						: useCamera
							? "ACTIVÁ MIC + CÁMARA PARA EMPEZAR"
							: "ACTIVÁ MIC PARA EMPEZAR"}
				</div>
			</section>
		</div>
	);
}
