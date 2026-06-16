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

function isReceivingTrack(track: MediaStreamTrack): boolean {
	return track.readyState === "live" && !track.muted;
}

function senderKind(pc: RTCPeerConnection, sender: RTCRtpSender): MediaStreamTrack["kind"] | null {
	return sender.track?.kind ?? pc.getTransceivers().find((transceiver) => transceiver.sender === sender)?.receiver.track.kind ?? null;
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

export function useWebRtcPeer({ enabled, peerKey, initiator, localStream, incomingSignal, onSignal }: Options) {
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const remoteStreamRef = useRef<MediaStream | null>(null);
	const handledSignalSeq = useRef(0);
	const makingOffer = useRef(false);
	const peerKeyRef = useRef<string | null>(null);
	const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
	const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
	const [status, setStatus] = useState<PeerStatus>("idle");
	const [iceServers, setIceServers] = useState<RTCIceServer[]>(ICE_SERVERS);
	const [iceServersReady, setIceServersReady] = useState(Boolean(process.env.NEXT_PUBLIC_RTC_ICE_SERVERS));

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
		handledSignalSeq.current = 0;
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

	const makeOffer = useCallback(
		async (pc: RTCPeerConnection, options?: RTCOfferOptions) => {
			if (makingOffer.current || pc.signalingState !== "stable") return;
			makingOffer.current = true;
			try {
				const offer = await pc.createOffer(options);
				await pc.setLocalDescription(offer);
				if (pc.localDescription) {
					onSignal({ type: "offer", description: pc.localDescription.toJSON() });
				}
			} finally {
				makingOffer.current = false;
			}
		},
		[onSignal],
	);

	const createPeer = useCallback(() => {
		if (pcRef.current) return pcRef.current;
		const pc = new RTCPeerConnection({
			iceServers,
			bundlePolicy: "max-bundle",
			iceCandidatePoolSize: 2,
		});
		pc.addTransceiver("audio", { direction: "sendrecv" });
		pc.addTransceiver("video", { direction: "sendrecv" });
		pcRef.current = pc;
		setStatus("connecting");

		pc.onicecandidate = (event) => {
			const candidate = event.candidate?.toJSON();
			if (candidate?.candidate) {
				onSignal({ type: "ice", candidate: { ...candidate, candidate: candidate.candidate } });
			}
		};
		pc.ontrack = (event) => {
			const next = remoteStreamRef.current ?? new MediaStream();
			remoteStreamRef.current = next;
			const tracks = event.streams[0]?.getTracks() ?? [event.track];
			for (const track of tracks) {
				if (next.getTracks().some((existing) => existing.id === track.id)) continue;
				next.addTrack(track);
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
			if (!initiator && !pc.remoteDescription) return;
			void makeOffer(pc).catch(() => setStatus("failed"));
		};
		pc.onconnectionstatechange = () => {
			const state = pc.connectionState;
			if (state === "connected") {
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
					if (pcRef.current === pc && pc.connectionState === "disconnected") setStatus("failed");
				}, 5000);
				return;
			}
			if (state === "failed") {
				clearDisconnectTimer();
				if (initiator && pc.signalingState === "stable") {
					setStatus("connecting");
					pc.restartIce();
					void makeOffer(pc, { iceRestart: true }).catch(() => setStatus("failed"));
					return;
				}
				setStatus("failed");
			}
			if (state === "closed") {
				clearDisconnectTimer();
				setStatus("idle");
			}
		};
		pc.oniceconnectionstatechange = () => {
			if (pc.iceConnectionState === "failed" && initiator && pc.signalingState === "stable") {
				setStatus("connecting");
				pc.restartIce();
				void makeOffer(pc, { iceRestart: true }).catch(() => setStatus("failed"));
			}
		};
		pc.onicecandidateerror = () => {
			if (remoteStreamRef.current) {
				setStatus("connecting");
			}
		};
		return pc;
	}, [clearDisconnectTimer, iceServers, initiator, makeOffer, onSignal, publishRemoteStream]);

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
			if (!cancelled) {
				onSignal({ type: "media-ready" });
				if (initiator && pc.signalingState === "stable") await makeOffer(pc);
			}
		};
		void syncTracks().catch(() => setStatus("failed"));
		return () => {
			cancelled = true;
		};
	}, [createPeer, enabled, iceServersReady, initiator, localStream, makeOffer, onSignal]);

	useEffect(() => {
		if (!enabled || !iceServersReady || !incomingSignal || incomingSignal.seq <= handledSignalSeq.current) return;
		if (incomingSignal.peerKey !== peerKey) return;
		handledSignalSeq.current = incomingSignal.seq;
		const pc = createPeer();
		const applySignal = async () => {
			const signal = incomingSignal.signal;
			if (signal.type === "media-ready") {
				if (initiator && pc.signalingState === "stable") await makeOffer(pc);
				return;
			}
			if (signal.type === "offer") {
				const offerCollision = makingOffer.current || pc.signalingState !== "stable";
				if (offerCollision && initiator) return;
				await pc.setRemoteDescription(signal.description);
				await flushPendingIceCandidates(pc);
				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);
				if (pc.localDescription) {
					onSignal({ type: "answer", description: pc.localDescription.toJSON() });
				}
				return;
			}
			if (signal.type === "answer") {
				if (pc.signalingState !== "have-local-offer") return;
				await pc.setRemoteDescription(signal.description);
				await flushPendingIceCandidates(pc);
				return;
			}
			if (signal.type === "ice") {
				await addIceCandidate(pc, signal.candidate);
			}
		};
		void applySignal().catch(() => setStatus("failed"));
	}, [addIceCandidate, createPeer, enabled, flushPendingIceCandidates, iceServersReady, incomingSignal, initiator, makeOffer, onSignal, peerKey]);

	useEffect(() => {
		if (enabled) return;
		closePeer();
	}, [closePeer, enabled]);

	useEffect(() => {
		return () => closePeer();
	}, [closePeer]);

	return { remoteStream, status };
}
