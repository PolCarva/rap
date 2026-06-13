"use client";

import type { ModalityId } from "@rap/shared";
import { useEffect, useRef, useState } from "react";
import { BattleStage } from "./BattleStage";
import { SearchingScreen } from "./SearchingScreen";
import { SetupScreen } from "./SetupScreen";
import { useBattleEngine } from "./useBattleEngine";
import { useMediaStream } from "./useMediaStream";
import { useRapSession, type RapSession } from "./useRapSession";

export function BattleApp({ initialModality = "minuto-libre" }: { initialModality?: ModalityId }) {
	const engine = useBattleEngine();
	// El stream vive acá para persistir entre setup y la batalla.
	const media = useMediaStream();
	const rapSession = useRapSession();
	const [modality, setModality] = useState<ModalityId>(initialModality);
	const { state } = engine;
	const resumedRef = useRef(false);
	// Última búsqueda, para re-encolar con la misma config si el rival abandona.
	const [lastSearch, setLastSearch] = useState<{ session: RapSession; modality: ModalityId; beatId: string | null; devBot: boolean } | null>(null);

	// Tras un refresh, retomar la batalla activa si la había.
	const { resume } = engine;
	useEffect(() => {
		if (resumedRef.current) return;
		resumedRef.current = true;
		resume();
	}, [resume]);

	if (state.view === "battle" && state.myRole) {
		if (!state.battle) {
			// Reanudando: todavía no llegó el snapshot de la sala.
			return (
				<div className="battle-phase">
					<div className="arena-grain" />
					<div className="arena-vignette" />
					<div className="battle-radar"><div className="core" /></div>
					<div className="battle-searching-title">RECONECTANDO<span className="red">…</span></div>
					<button onClick={engine.leave} className="btn-ghost">SALIR</button>
				</div>
			);
		}
		return (
			<BattleStage
				battle={state.battle}
				myRole={state.myRole}
				opponentCaption={state.opponentCaption}
				media={media}
				incomingSignal={state.incomingSignal}
				reconnecting={state.reconnecting}
				onReady={engine.sendReady}
				onCaption={engine.sendCaption}
				onSignal={engine.sendSignal}
				onSubmitVerse={engine.submitVerse}
				onRematch={engine.sendRematch}
				onLeave={engine.leave}
				onRequeue={
					lastSearch
						? () => {
								const last = lastSearch;
								engine.leave();
								void engine.search(last.session, last.modality, last.beatId, last.devBot);
							}
						: null
				}
			/>
		);
	}

	if (state.view === "searching") {
		return <SearchingScreen modality={modality} onCancel={engine.cancelSearch} />;
	}

	return (
		<SetupScreen
			error={state.error}
			initialModality={modality}
			media={media}
			session={rapSession.session}
			onSearch={(identity, m, beatId, devBot) => {
				const nextSession: RapSession = identity.isGuest
					? {
							...rapSession.session,
							name: identity.name,
							userId: null,
							isGuest: true,
							email: null,
						}
					: rapSession.session.userId
						? { ...rapSession.session, name: identity.name, isGuest: false }
						: {
								...rapSession.session,
								name: identity.name,
								userId: null,
								isGuest: false,
								email: identity.email,
							};
				if (nextSession.isGuest) rapSession.enterAsGuest(nextSession.name);
				fetch("/api/session", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						sessionId: nextSession.sessionId,
						userId: nextSession.userId,
						name: nextSession.name,
						isGuest: nextSession.isGuest,
					}),
				}).catch(() => {});
				setModality(m);
				setLastSearch({ session: nextSession, modality: m, beatId, devBot });
				engine.search(nextSession, m, beatId, devBot);
			}}
		/>
	);
}
