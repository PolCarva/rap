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

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function useWebRtcPeer({ enabled, peerKey, initiator, localStream, incomingSignal, onSignal }: Options) {
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const remoteStreamRef = useRef<MediaStream | null>(null);
	const handledSignalSeq = useRef(0);
	const makingOffer = useRef(false);
	const peerKeyRef = useRef<string | null>(null);
	const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
	const [status, setStatus] = useState<PeerStatus>("idle");

	const clearDisconnectTimer = useCallback(() => {
		if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
		disconnectTimerRef.current = null;
	}, []);

	const publishRemoteStream = useCallback(() => {
		const stream = remoteStreamRef.current;
		const liveTracks = stream?.getTracks().filter((track) => track.readyState === "live") ?? [];
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
	}, [clearDisconnectTimer]);

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
		const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
	}, [clearDisconnectTimer, initiator, makeOffer, onSignal, publishRemoteStream]);

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
		if (!enabled || !localStream) return;
		const pc = createPeer();
		let cancelled = false;
		const syncTracks = async () => {
			const liveTracks = localStream.getTracks().filter((track) => track.readyState === "live");
			for (const sender of pc.getSenders()) {
				if (sender.track && (!liveTracks.includes(sender.track) || sender.track.readyState !== "live")) {
					pc.removeTrack(sender);
				}
			}
			for (const track of liveTracks) {
				if (cancelled) return;
				const senders = pc.getSenders();
				if (senders.some((sender) => sender.track === track)) continue;
				const sameKind = senders.find((sender) => sender.track?.kind === track.kind);
				if (sameKind) await sameKind.replaceTrack(track);
				else pc.addTrack(track, localStream);
			}
			if (!cancelled) {
				onSignal({ type: "media-ready" });
				if (initiator && pc.signalingState === "stable") await makeOffer(pc);
			}
		};
		void syncTracks().catch(() => setStatus("failed"));
		return () => {
			cancelled = true;
		};
	}, [createPeer, enabled, initiator, localStream, makeOffer, onSignal]);

	useEffect(() => {
		if (!enabled || !localStream || !initiator) return;
		const pc = createPeer();
		if (pc.signalingState !== "stable") return;
		let cancelled = false;
		const sendInitialOffer = async () => {
			try {
				if (cancelled) return;
				await makeOffer(pc);
			} catch {
				setStatus("failed");
			}
		};
		void sendInitialOffer();
		return () => {
			cancelled = true;
		};
	}, [createPeer, enabled, initiator, localStream, makeOffer]);

	useEffect(() => {
		if (!enabled || !incomingSignal || incomingSignal.seq <= handledSignalSeq.current) return;
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
				return;
			}
			if (signal.type === "ice") {
				await pc.addIceCandidate(signal.candidate);
			}
		};
		void applySignal().catch(() => setStatus("failed"));
	}, [createPeer, enabled, incomingSignal, initiator, makeOffer, onSignal, peerKey]);

	useEffect(() => {
		if (enabled) return;
		closePeer();
	}, [closePeer, enabled]);

	useEffect(() => {
		return () => closePeer();
	}, [closePeer]);

	return { remoteStream, status };
}
