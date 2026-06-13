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
	const handledSignalSeq = useRef(0);
	const makingOffer = useRef(false);
	const peerKeyRef = useRef<string | null>(null);
	const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
	const [status, setStatus] = useState<PeerStatus>("idle");

	const closePeer = useCallback(() => {
		pcRef.current?.close();
		pcRef.current = null;
		setRemoteStream(null);
		setStatus("idle");
		makingOffer.current = false;
	}, []);

	const makeOffer = useCallback(
		async (pc: RTCPeerConnection) => {
			if (makingOffer.current || pc.signalingState !== "stable") return;
			makingOffer.current = true;
			try {
				const offer = await pc.createOffer();
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
			const [stream] = event.streams;
			if (stream) {
				setRemoteStream(stream);
				return;
			}
			setRemoteStream((prev) => {
				const next = prev ?? new MediaStream();
				if (!next.getTracks().some((track) => track.id === event.track.id)) next.addTrack(event.track);
				return next;
			});
		};
		pc.onnegotiationneeded = () => {
			if (!initiator && !pc.remoteDescription) return;
			void makeOffer(pc).catch(() => setStatus("failed"));
		};
		pc.onconnectionstatechange = () => {
			if (pc.connectionState === "connected") setStatus("connected");
			if (pc.connectionState === "failed" || pc.connectionState === "disconnected") setStatus("failed");
		};
		return pc;
	}, [initiator, makeOffer, onSignal]);

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
			if (!cancelled) onSignal({ type: "media-ready" });
		};
		void syncTracks().catch(() => setStatus("failed"));
		return () => {
			cancelled = true;
		};
	}, [createPeer, enabled, localStream, onSignal]);

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
			if (signal.type === "media-ready") return;
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
	}, [createPeer, enabled, incomingSignal, initiator, onSignal, peerKey]);

	useEffect(() => {
		if (enabled) return;
		closePeer();
	}, [closePeer, enabled]);

	useEffect(() => {
		return () => closePeer();
	}, [closePeer]);

	return { remoteStream, status };
}
