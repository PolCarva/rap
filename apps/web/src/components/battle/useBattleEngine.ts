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
	type Role,
} from "@rap/shared";
import { useCallback, useRef, useState } from "react";

export type View = "setup" | "searching" | "battle";

export interface EngineState {
	view: View;
	error: string | null;
	myRole: Role | null;
	battle: BattleState | null;
	/** Caption en vivo del rival (transitorio, no parte del estado autoritativo). */
	opponentCaption: string;
}

const INITIAL: EngineState = {
	view: "setup",
	error: null,
	myRole: null,
	battle: null,
	opponentCaption: "",
};

export function useBattleEngine() {
	const [state, setState] = useState<EngineState>(INITIAL);
	const mmRef = useRef<WebSocket | null>(null);
	const roomRef = useRef<WebSocket | null>(null);
	const nameRef = useRef<string>("");

	const closeSockets = useCallback(() => {
		mmRef.current?.close();
		roomRef.current?.close();
		mmRef.current = null;
		roomRef.current = null;
	}, []);

	/** Conecta a la sala de batalla una vez que el matchmaking nos emparejó. */
	const joinBattle = useCallback((battleId: string, role: Role, name: string) => {
		const ws = new WebSocket(battleUrl(battleId));
		roomRef.current = ws;
		ws.addEventListener("open", () => {
			ws.send(JSON.stringify({ kind: "hello", role, name }));
		});
		ws.addEventListener("message", (ev) => {
			let msg;
			try {
				msg = roomServerMessageSchema.parse(JSON.parse(ev.data as string));
			} catch {
				return;
			}
			if (msg.kind === "snapshot") {
				setState((s) => ({ ...s, view: "battle", battle: msg.state, myRole: role }));
			} else if (msg.kind === "caption") {
				if (msg.role !== role) setState((s) => ({ ...s, opponentCaption: msg.text }));
			} else if (msg.kind === "error") {
				setState((s) => ({ ...s, error: msg.message }));
			}
		});
		ws.addEventListener("error", () =>
			setState((s) => ({ ...s, error: "Error de conexión con la sala" })),
		);
	}, []);

	const search = useCallback(
		(name: string, modality: ModalityId) => {
			nameRef.current = name;
			setState({ ...INITIAL, view: "searching" });
			const ws = new WebSocket(matchmakingUrl());
			mmRef.current = ws;
			ws.addEventListener("open", () => {
				ws.send(JSON.stringify({ kind: "queue", modality, name }));
			});
			ws.addEventListener("message", (ev) => {
				let msg;
				try {
					msg = mmServerMessageSchema.parse(JSON.parse(ev.data as string));
				} catch {
					return;
				}
				if (msg.kind === "matched") {
					joinBattle(msg.battleId, msg.role, name);
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

	const submitVerse = useCallback((text: string) => {
		roomRef.current?.send(JSON.stringify({ kind: "verse", text }));
	}, []);

	const leave = useCallback(() => {
		roomRef.current?.send(JSON.stringify({ kind: "leave" }));
		closeSockets();
		setState(INITIAL);
	}, [closeSockets]);

	return { state, search, cancelSearch, sendReady, sendCaption, submitVerse, leave };
}
