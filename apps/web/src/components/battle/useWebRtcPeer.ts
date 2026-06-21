"use client";

import type { RtcSignal, Role } from "@rap/shared";
import { useCallback, useEffect, useRef, useState } from "react";

type PeerStatus = "idle" | "connecting" | "connected" | "failed";

interface IncomingSignal {
	role: Role;
	signal: RtcSignal;
	seq: number;
	peerKey: string | null;
}

interface Options {
	enabled: boolean;
	peerKey: string;
	initiator: boolean;
	localStream: MediaStream | null;
	incomingSignal: IncomingSignal | null;
	onSignal: (signal: RtcSignal) => void;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
	{ urls: "stun:stun.cloudflare.com:3478" },
	{ urls: "stun:stun.l.google.com:19302" },
];
const VIDEO_MAX_BITRATE = 850_000;
const VIDEO_MAX_FRAMERATE = 24;
/** Cada cuánto el watchdog revisa que la conexión haya prendido. */
const WATCHDOG_INTERVAL_MS = 1800;
/** Ticks sin conectar (≈ WATCHDOG_INTERVAL_MS × N) antes de reiniciar ICE. */
const WATCHDOG_RESTART_AFTER_TICKS = 3;

function parseIceServers(raw: string | undefined): RTCIceServer[] {
	if (!raw) return DEFAULT_ICE_SERVERS;
	try {
		const parsed = JSON.parse(raw) as unknown;
		const servers = Array.isArray(parsed) ? parsed : [parsed];
		const valid = servers.filter((server): server is RTCIceServer => {
			if (!server || typeof server !== "object") return false;
			const urls = (server as RTCIceServer).urls;
			return typeof urls === "string" || (Array.isArray(urls) && urls.every((url) => typeof url === "string"));
		});
		return valid.length > 0 ? valid : DEFAULT_ICE_SERVERS;
	} catch {
		return DEFAULT_ICE_SERVERS;
	}
}

const ICE_SERVERS = parseIceServers(process.env.NEXT_PUBLIC_RTC_ICE_SERVERS);

async function fetchIceServers(): Promise<RTCIceServer[]> {
	if (process.env.NEXT_PUBLIC_RTC_ICE_SERVERS) return ICE_SERVERS;
	try {
		const res = await fetch("/api/rtc/ice-servers", { cache: "no-store" });
		if (!res.ok) return ICE_SERVERS;
		const data = (await res.json()) as { iceServers?: unknown };
		return parseIceServers(JSON.stringify(data.iceServers));
	} catch {
		return ICE_SERVERS;
	}
}

function senderKind(pc: RTCPeerConnection, sender: RTCRtpSender): MediaStreamTrack["kind"] | null {
	return sender.track?.kind ?? pc.getTransceivers().find((transceiver) => transceiver.sender === sender)?.receiver.track.kind ?? null;
}

function isReceivingTrack(track: MediaStreamTrack): boolean {
	return track.readyState === "live" && !track.muted;
}

async function tuneSender(sender: RTCRtpSender): Promise<void> {
	if (sender.track?.kind !== "video") return;
	const params = sender.getParameters();
	params.encodings = params.encodings?.length ? params.encodings : [{}];
	params.encodings[0] = {
		...params.encodings[0],
		maxBitrate: VIDEO_MAX_BITRATE,
		maxFramerate: VIDEO_MAX_FRAMERATE,
	};
	await sender.setParameters(params);
}

/**
 * Conexión de medios entre los dos MCs mediante "perfect negotiation".
 *
 * El rol p1 es el impaciente (impolite) y p2 el cortés (polite): ante una
 * colisión de ofertas (glare), p1 ignora la oferta entrante y p2 hace rollback
 * de la suya y acepta la del rival. Modern setRemoteDescription hace el rollback
 * implícito, así que el caso de cruce de ofertas converge solo.
 *
 * Sobre eso, un watchdog reemite la última descripción local mientras la
 * conexión no haya prendido. Esto es lo que garantiza que SIEMPRE se vean y
 * escuchen: si una oferta/respuesta se pierde (red, reordenamiento, o el cambio
 * de sala en una revancha donde la señal llega antes que el snapshot nuevo), el
 * watchdog la reenvía hasta que ambos lados quedan conectados. Antes, una sola
 * oferta perdida dejaba a p1 atascado en `have-local-offer` para siempre y el
 * rival nunca recibía medios (aunque la transcripción, que va por el WebSocket,
 * seguía llegando).
 */
export function useWebRtcPeer({ enabled, peerKey, initiator, localStream, incomingSignal, onSignal }: Options) {
	const polite = !initiator;
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const remoteStreamRef = useRef<MediaStream | null>(null);
	const handledSignalSeq = useRef(0);
	const makingOffer = useRef(false);
	const ignoreOffer = useRef(false);
	const settingRemoteAnswer = useRef(false);
	const peerKeyRef = useRef<string | null>(null);
	const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
	const stuckTicksRef = useRef(0);
	const onSignalRef = useRef(onSignal);
	const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
	const [status, setStatus] = useState<PeerStatus>("idle");
	const [iceServers, setIceServers] = useState<RTCIceServer[]>(ICE_SERVERS);
	const [iceServersReady, setIceServersReady] = useState(Boolean(process.env.NEXT_PUBLIC_RTC_ICE_SERVERS));

	useEffect(() => {
		onSignalRef.current = onSignal;
	}, [onSignal]);

	const clearDisconnectTimer = useCallback(() => {
		if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
		disconnectTimerRef.current = null;
	}, []);

	const publishRemoteStream = useCallback(() => {
		const stream = remoteStreamRef.current;
		const liveTracks = stream?.getTracks().filter(isReceivingTrack) ?? [];
		setRemoteStream(liveTracks.length > 0 ? new MediaStream(liveTracks) : null);
	}, []);

	const closePeer = useCallback(() => {
		clearDisconnectTimer();
		pcRef.current?.close();
		pcRef.current = null;
		remoteStreamRef.current = null;
		setRemoteStream(null);
		setStatus("idle");
		makingOffer.current = false;
		ignoreOffer.current = false;
		settingRemoteAnswer.current = false;
		handledSignalSeq.current = 0;
		stuckTicksRef.current = 0;
		pendingIceCandidatesRef.current = [];
	}, [clearDisconnectTimer]);

	const flushPendingIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
		if (!pc.remoteDescription || pendingIceCandidatesRef.current.length === 0) return;
		const pending = pendingIceCandidatesRef.current.splice(0);
		for (const candidate of pending) {
			await pc.addIceCandidate(candidate).catch(() => {});
		}
	}, []);

	const addIceCandidate = useCallback(async (pc: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
		if (!pc.remoteDescription) {
			pendingIceCandidatesRef.current.push(candidate);
			return;
		}
		await pc.addIceCandidate(candidate).catch(() => {});
	}, []);

	const emitLocalDescription = useCallback((pc: RTCPeerConnection) => {
		const desc = pc.localDescription;
		if (!desc) return;
		if (desc.type === "offer") onSignalRef.current({ type: "offer", description: desc.toJSON() });
		else if (desc.type === "answer") onSignalRef.current({ type: "answer", description: desc.toJSON() });
	}, []);

	const makeOffer = useCallback(
		async (pc: RTCPeerConnection, options?: RTCOfferOptions) => {
			if (makingOffer.current) return;
			if (!options?.iceRestart && pc.signalingState !== "stable") return;
			makingOffer.current = true;
			try {
				const offer = await pc.createOffer(options);
				if (pcRef.current !== pc) return;
				await pc.setLocalDescription(offer);
				emitLocalDescription(pc);
			} catch {
				/* el watchdog reintenta */
			} finally {
				makingOffer.current = false;
			}
		},
		[emitLocalDescription],
	);

	const createPeer = useCallback(() => {
		if (pcRef.current) return pcRef.current;
		const pc = new RTCPeerConnection({
			iceServers,
			bundlePolicy: "max-bundle",
			iceCandidatePoolSize: 2,
		});
		// Transceivers fijos sendrecv: el layout de m-lines queda estable y simétrico,
		// así adjuntar tracks luego es un replaceTrack sin renegociar.
		pc.addTransceiver("audio", { direction: "sendrecv" });
		pc.addTransceiver("video", { direction: "sendrecv" });
		pcRef.current = pc;
		setStatus("connecting");

		pc.onicecandidate = (event) => {
			const candidate = event.candidate?.toJSON();
			if (candidate?.candidate) {
				onSignalRef.current({ type: "ice", candidate: { ...candidate, candidate: candidate.candidate } });
			}
		};
		pc.ontrack = (event) => {
			const stream = remoteStreamRef.current ?? new MediaStream();
			remoteStreamRef.current = stream;
			const track = event.track;
			if (!stream.getTracks().some((existing) => existing.id === track.id)) {
				stream.addTrack(track);
				track.addEventListener("unmute", publishRemoteStream);
				track.addEventListener("mute", publishRemoteStream);
				track.addEventListener("ended", () => {
					remoteStreamRef.current?.removeTrack(track);
					publishRemoteStream();
				});
			}
			publishRemoteStream();
			setStatus("connected");
		};
		pc.onnegotiationneeded = () => {
			// Solo el impaciente (p1) inicia; el polite (p2) responde. Como los tracks
			// se adjuntan sobre transceivers ya creados (replaceTrack, sin renegociar),
			// p2 nunca necesita ofertar, y así evitamos el cruce de ofertas.
			if (!initiator) return;
			void makeOffer(pc);
		};
		pc.onconnectionstatechange = () => {
			const state = pc.connectionState;
			if (state === "connected") {
				stuckTicksRef.current = 0;
				clearDisconnectTimer();
				setStatus("connected");
				return;
			}
			if (state === "connecting" || state === "new") {
				clearDisconnectTimer();
				setStatus("connecting");
				return;
			}
			if (state === "disconnected") {
				setStatus("connecting");
				clearDisconnectTimer();
				disconnectTimerRef.current = setTimeout(() => {
					if (pcRef.current === pc && pc.connectionState === "disconnected" && initiator) {
						pc.restartIce();
						void makeOffer(pc, { iceRestart: true });
					}
				}, 4000);
				return;
			}
			if (state === "failed") {
				clearDisconnectTimer();
				setStatus("connecting");
				if (initiator) {
					pc.restartIce();
					void makeOffer(pc, { iceRestart: true });
				}
				return;
			}
			if (state === "closed") {
				clearDisconnectTimer();
				setStatus("idle");
			}
		};
		pc.oniceconnectionstatechange = () => {
			if (pc.iceConnectionState === "failed" && initiator) {
				pc.restartIce();
				void makeOffer(pc, { iceRestart: true });
			}
		};
		return pc;
	}, [clearDisconnectTimer, iceServers, initiator, makeOffer, publishRemoteStream]);

	useEffect(() => {
		if (!enabled || iceServersReady) return;
		let cancelled = false;
		void fetchIceServers().then((servers) => {
			if (cancelled) return;
			setIceServers(servers);
			setIceServersReady(true);
		});
		return () => {
			cancelled = true;
		};
	}, [enabled, iceServersReady]);

	useEffect(() => {
		if (peerKeyRef.current === null) {
			peerKeyRef.current = peerKey;
			return;
		}
		if (peerKeyRef.current === peerKey) return;
		peerKeyRef.current = peerKey;
		closePeer();
	}, [closePeer, peerKey]);

	useEffect(() => {
		if (!enabled || !localStream || !iceServersReady) return;
		const pc = createPeer();
		let cancelled = false;
		const syncTracks = async () => {
			const liveTracks = localStream.getTracks().filter((track) => track.readyState === "live");
			const replacements: Promise<void>[] = [];
			const tunedSenders = new Set<RTCRtpSender>();
			for (const sender of pc.getSenders()) {
				const kind = senderKind(pc, sender);
				if (!kind) continue;
				const track = liveTracks.find((liveTrack) => liveTrack.kind === kind) ?? null;
				if (sender.track !== track) replacements.push(sender.replaceTrack(track));
				if (track?.kind === "video") tunedSenders.add(sender);
			}
			for (const track of liveTracks) {
				if (pc.getSenders().some((sender) => senderKind(pc, sender) === track.kind)) continue;
				const sender = pc.addTrack(track, localStream);
				if (track.kind === "video") tunedSenders.add(sender);
			}
			await Promise.all(replacements);
			if (cancelled) return;
			await Promise.all([...tunedSenders].map((sender) => tuneSender(sender).catch(() => {})));
			// La negociación la dispara onnegotiationneeded (transceivers añadidos al
			// crear el peer); el watchdog cubre cualquier oferta/respuesta perdida.
		};
		void syncTracks().catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [createPeer, enabled, iceServersReady, localStream]);

	useEffect(() => {
		if (!enabled || !iceServersReady || !incomingSignal || incomingSignal.seq <= handledSignalSeq.current) return;
		if (incomingSignal.peerKey !== peerKey) return;
		handledSignalSeq.current = incomingSignal.seq;
		const pc = createPeer();
		const signal = incomingSignal.signal;
		const applySignal = async () => {
			if (signal.type === "media-ready") return; // legacy: la negociación ya no depende de esto
			if (signal.type === "offer" || signal.type === "answer") {
				const description = signal.description;
				const readyForOffer =
					!makingOffer.current && (pc.signalingState === "stable" || settingRemoteAnswer.current);
				const offerCollision = description.type === "offer" && !readyForOffer;
				ignoreOffer.current = !polite && offerCollision;
				if (ignoreOffer.current) return;
				settingRemoteAnswer.current = description.type === "answer";
				try {
					// En colisión, el polite hace rollback implícito al setear la oferta remota.
					await pc.setRemoteDescription(description);
				} finally {
					settingRemoteAnswer.current = false;
				}
				await flushPendingIceCandidates(pc);
				if (description.type === "offer") {
					const answer = await pc.createAnswer();
					await pc.setLocalDescription(answer);
					emitLocalDescription(pc);
				}
				return;
			}
			if (signal.type === "ice") {
				try {
					await addIceCandidate(pc, signal.candidate);
				} catch {
					if (!ignoreOffer.current) throw new Error("ice");
				}
			}
		};
		void applySignal().catch(() => {
			/* estado de señalización inesperado: el watchdog reconverge */
		});
	}, [
		addIceCandidate,
		createPeer,
		emitLocalDescription,
		enabled,
		flushPendingIceCandidates,
		iceServersReady,
		incomingSignal,
		polite,
		peerKey,
	]);

	// Watchdog: mientras no esté conectado, reemitir la descripción local para
	// recuperar señales perdidas y, tras varios intentos, reiniciar ICE.
	useEffect(() => {
		if (!enabled || !iceServersReady) return;
		const id = setInterval(() => {
			const pc = pcRef.current;
			if (!pc) return;
			const conn = pc.connectionState;
			if (conn === "connected") {
				stuckTicksRef.current = 0;
				return;
			}
			stuckTicksRef.current += 1;
			// Tenemos una oferta local sin respuesta (o la respuesta se perdió):
			// reenviarla hace que el rival la procese / vuelva a responder.
			if (pc.signalingState === "have-local-offer" && !makingOffer.current) {
				emitLocalDescription(pc);
				return;
			}
			// Estable pero sin conectar por varios ticks: problema de ICE.
			if (pc.signalingState === "stable" && stuckTicksRef.current >= WATCHDOG_RESTART_AFTER_TICKS) {
				stuckTicksRef.current = 0;
				if (initiator) {
					pc.restartIce();
					void makeOffer(pc, { iceRestart: true });
				} else {
					// El polite reemite su última respuesta por si se perdió.
					emitLocalDescription(pc);
				}
			}
		}, WATCHDOG_INTERVAL_MS);
		return () => clearInterval(id);
	}, [emitLocalDescription, enabled, iceServersReady, initiator, makeOffer]);

	useEffect(() => {
		if (enabled) return;
		closePeer();
	}, [closePeer, enabled]);

	useEffect(() => {
		return () => closePeer();
	}, [closePeer]);

	return { remoteStream, status };
}
