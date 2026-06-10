"use client";

import {
	battleUrl,
	matchmakingUrl,
} from "@/lib/realtime";
import {
	mmServerMessageSchema,
	roomServerMessageSchema,
	type BattleState,
	type ModalityId,
	type RtcSignal,
	type Role,
} from "@rap/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RapSession } from "./useRapSession";

export type View = "setup" | "searching" | "battle";

export interface EngineState {
	view: View;
	error: string | null;
	myRole: Role | null;
	battle: BattleState | null;
	/** Caption en vivo del rival (transitorio, no parte del estado autoritativo). */
	opponentCaption: string;
	incomingSignal: { role: Role; signal: RtcSignal; seq: number } | null;
	/** true mientras se reintenta la conexión con la sala. */
	reconnecting: boolean;
}

const INITIAL: EngineState = {
	view: "setup",
	error: null,
	myRole: null,
	battle: null,
	opponentCaption: "",
	incomingSignal: null,
	reconnecting: false,
};

/** Batalla activa persistida para sobrevivir a un refresh de la página. */
const ACTIVE_BATTLE_KEY = "rap-active-battle-v1";

interface StoredBattle {
	battleId: string;
	role: Role;
	session: RapSession;
}

function readStoredBattle(): StoredBattle | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.sessionStorage.getItem(ACTIVE_BATTLE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as StoredBattle;
		if (!parsed.battleId || !parsed.role || !parsed.session?.sessionId) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeStoredBattle(stored: StoredBattle | null): void {
	if (typeof window === "undefined") return;
	try {
		if (stored) window.sessionStorage.setItem(ACTIVE_BATTLE_KEY, JSON.stringify(stored));
		else window.sessionStorage.removeItem(ACTIVE_BATTLE_KEY);
	} catch {
		/* storage lleno o bloqueado: la reanudación es best-effort */
	}
}

const MAX_RECONNECT_ATTEMPTS = 5;

export function useBattleEngine() {
	const [state, setState] = useState<EngineState>(INITIAL);
	const mmRef = useRef<WebSocket | null>(null);
	const roomRef = useRef<WebSocket | null>(null);
	const signalSeqRef = useRef(0);
	/** true cuando el usuario abandonó a propósito: no reintentar. */
	const leftRef = useRef(false);
	const reconnectAttemptsRef = useRef(0);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastPhaseRef = useRef<BattleState["phase"] | null>(null);

	const closeSockets = useCallback(() => {
		if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
		reconnectTimerRef.current = null;
		mmRef.current?.close();
		roomRef.current?.close();
		mmRef.current = null;
		roomRef.current = null;
	}, []);

	/** Conecta a la sala de batalla (primer ingreso o reconexión). */
	const joinBattle = useCallback((battleId: string, role: Role, session: RapSession) => {
		leftRef.current = false;
		writeStoredBattle({ battleId, role, session });
		const ws = new WebSocket(battleUrl(battleId));
		roomRef.current = ws;

		ws.addEventListener("open", () => {
			reconnectAttemptsRef.current = 0;
			setState((s) => ({ ...s, reconnecting: false, error: null }));
			ws.send(
				JSON.stringify({
					kind: "hello",
					role,
					name: session.name,
					sessionId: session.sessionId,
					userId: session.userId,
					isGuest: session.isGuest,
				}),
			);
		});

		ws.addEventListener("message", (ev) => {
			let msg;
			try {
				msg = roomServerMessageSchema.parse(JSON.parse(ev.data as string));
			} catch {
				return;
			}
			if (msg.kind === "snapshot") {
				lastPhaseRef.current = msg.state.phase;
				setState((s) => ({ ...s, view: "battle", battle: msg.state, myRole: role, reconnecting: false }));
			} else if (msg.kind === "caption") {
				if (msg.role !== role) setState((s) => ({ ...s, opponentCaption: msg.text }));
			} else if (msg.kind === "signal") {
				if (msg.role !== role) {
					const seq = ++signalSeqRef.current;
					setState((s) => ({ ...s, incomingSignal: { role: msg.role, signal: msg.signal, seq } }));
				}
			} else if (msg.kind === "error") {
				// Sala expirada o rol tomado: no hay batalla que retomar.
				if (msg.message.includes("no inicializada") || msg.message.includes("ocupado")) {
					writeStoredBattle(null);
					leftRef.current = true;
					setState({ ...INITIAL, error: "La batalla ya no está disponible" });
					return;
				}
				setState((s) => ({ ...s, error: msg.message }));
			}
		});

		ws.addEventListener("close", () => {
			if (roomRef.current !== ws) return; // ya fue reemplazado por otra conexión
			const phase = lastPhaseRef.current;
			const over = phase === "result" || phase === "aborted";
			if (leftRef.current || over) return;
			// Conexión caída en plena batalla: reintentar con backoff.
			if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
				setState((s) => ({ ...s, reconnecting: false, error: "Se perdió la conexión con la sala" }));
				return;
			}
			reconnectAttemptsRef.current += 1;
			const delay = Math.min(4000, 600 * reconnectAttemptsRef.current);
			setState((s) => ({ ...s, reconnecting: true }));
			reconnectTimerRef.current = setTimeout(() => {
				if (!leftRef.current) joinBattle(battleId, role, session);
			}, delay);
		});

		ws.addEventListener("error", () => {
			// el handler de close decide el reintento
		});
	}, []);

	/** Retoma una batalla activa después de un refresh. */
	const resume = useCallback((): boolean => {
		const stored = readStoredBattle();
		if (!stored) return false;
		setState((s) => ({ ...s, view: "battle", myRole: stored.role, reconnecting: true }));
		joinBattle(stored.battleId, stored.role, stored.session);
		return true;
	}, [joinBattle]);

	const search = useCallback(
		async (session: RapSession, modality: ModalityId, beatId: string | null) => {
			leftRef.current = false;
			lastPhaseRef.current = null;
			reconnectAttemptsRef.current = 0;
			setState({ ...INITIAL, view: "searching" });

			// Modo rankeado: pedir el token que respalda el userId ante el worker.
			let authToken: string | null = null;
			if (!session.isGuest && session.userId) {
				authToken = await fetch("/api/auth/realtime-token")
					.then((r) => (r.ok ? (r.json() as Promise<{ token: string | null }>) : { token: null }))
					.then((d) => d.token)
					.catch(() => null);
			}

			const ws = new WebSocket(matchmakingUrl());
			mmRef.current = ws;
			ws.addEventListener("open", () => {
				ws.send(
					JSON.stringify({
						kind: "queue",
						modality,
						name: session.name,
						beatId,
						sessionId: session.sessionId,
						userId: session.userId,
						isGuest: session.isGuest,
						authToken,
					}),
				);
			});
			ws.addEventListener("message", (ev) => {
				let msg;
				try {
					msg = mmServerMessageSchema.parse(JSON.parse(ev.data as string));
				} catch {
					return;
				}
				if (msg.kind === "matched") {
					joinBattle(msg.battleId, msg.role, session);
				} else if (msg.kind === "error") {
					setState((s) => ({ ...s, view: "setup", error: msg.message }));
				}
			});
			ws.addEventListener("error", () =>
				setState((s) => ({ ...s, view: "setup", error: "No se pudo conectar al matchmaking" })),
			);
		},
		[joinBattle],
	);

	const cancelSearch = useCallback(() => {
		leftRef.current = true;
		mmRef.current?.send(JSON.stringify({ kind: "cancel" }));
		closeSockets();
		setState(INITIAL);
	}, [closeSockets]);

	const sendReady = useCallback(() => {
		roomRef.current?.send(JSON.stringify({ kind: "ready" }));
	}, []);

	const sendCaption = useCallback((text: string) => {
		roomRef.current?.send(JSON.stringify({ kind: "caption", text }));
	}, []);

	const sendSignal = useCallback((signal: RtcSignal) => {
		roomRef.current?.send(JSON.stringify({ kind: "signal", signal }));
	}, []);

	const submitVerse = useCallback((text: string) => {
		roomRef.current?.send(JSON.stringify({ kind: "verse", text }));
	}, []);

	const leave = useCallback(() => {
		leftRef.current = true;
		writeStoredBattle(null);
		try {
			roomRef.current?.send(JSON.stringify({ kind: "leave" }));
		} catch {
			/* socket ya cerrado */
		}
		closeSockets();
		setState(INITIAL);
	}, [closeSockets]);

	// Cerrar sockets al desmontar el componente.
	useEffect(() => closeSockets, [closeSockets]);

	return { state, search, cancelSearch, resume, sendReady, sendCaption, sendSignal, submitVerse, leave };
}
