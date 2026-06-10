"use client";

import type { RtcSignal, Role } from "@rap/shared";
import { useCallback, useEffect, useRef, useState } from "react";

type PeerStatus = "idle" | "connecting" | "connected" | "failed";

interface IncomingSignal {
	role: Role;
	signal: RtcSignal;
	seq: number;
}

interface Options {
	enabled: boolean;
	initiator: boolean;
	localStream: MediaStream | null;
	incomingSignal: IncomingSignal | null;
	onSignal: (signal: RtcSignal) => void;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function useWebRtcPeer({ enabled, initiator, localStream, incomingSignal, onSignal }: Options) {
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const handledSignalSeq = useRef(0);
	const makingOffer = useRef(false);
	const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
	const [status, setStatus] = useState<PeerStatus>("idle");

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
			if (stream) setRemoteStream(stream);
		};
		pc.onconnectionstatechange = () => {
			if (pc.connectionState === "connected") setStatus("connected");
			if (pc.connectionState === "failed" || pc.connectionState === "disconnected") setStatus("failed");
		};
		return pc;
	}, [onSignal]);

	useEffect(() => {
		if (!enabled || !localStream) return;
		const pc = createPeer();
		const senders = new Set(pc.getSenders().map((sender) => sender.track));
		for (const track of localStream.getTracks()) {
			if (!senders.has(track)) pc.addTrack(track, localStream);
		}
		onSignal({ type: "media-ready" });
	}, [createPeer, enabled, localStream, onSignal]);

	useEffect(() => {
		if (!enabled || !localStream || !initiator) return;
		const pc = createPeer();
		if (pc.signalingState !== "stable") return;
		let cancelled = false;
		const makeOffer = async () => {
			makingOffer.current = true;
			try {
				const offer = await pc.createOffer();
				if (cancelled) return;
				await pc.setLocalDescription(offer);
				if (pc.localDescription) {
					onSignal({ type: "offer", description: pc.localDescription.toJSON() });
				}
			} finally {
				makingOffer.current = false;
			}
		};
		void makeOffer();
		return () => {
			cancelled = true;
		};
	}, [createPeer, enabled, initiator, localStream, onSignal]);

	useEffect(() => {
		if (!enabled || !incomingSignal || incomingSignal.seq <= handledSignalSeq.current) return;
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
	}, [createPeer, enabled, incomingSignal, initiator, onSignal]);

	useEffect(() => {
		if (enabled) return;
		pcRef.current?.close();
		pcRef.current = null;
		setRemoteStream(null);
		setStatus("idle");
	}, [enabled]);

	useEffect(() => {
		return () => {
			pcRef.current?.close();
		};
	}, []);

	return { remoteStream, status };
}
