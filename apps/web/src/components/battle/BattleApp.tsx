"use client";

import type { ModalityId } from "@rap/shared";
import { useState } from "react";
import { BattleStage } from "./BattleStage";
import { SearchingScreen } from "./SearchingScreen";
import { SetupScreen } from "./SetupScreen";
import { useBattleEngine } from "./useBattleEngine";
import { useMediaStream } from "./useMediaStream";
import { useRapSession, type RapSession } from "./useRapSession";

export function BattleApp() {
	const engine = useBattleEngine();
	// El stream vive acá para persistir entre setup y la batalla.
	const media = useMediaStream();
	const rapSession = useRapSession();
	const [modality, setModality] = useState<ModalityId>("minuto-libre");
	const { state } = engine;

	if (state.view === "battle" && state.battle && state.myRole) {
		return (
			<BattleStage
				battle={state.battle}
				myRole={state.myRole}
				opponentCaption={state.opponentCaption}
				media={media}
				incomingSignal={state.incomingSignal}
				onReady={engine.sendReady}
				onCaption={engine.sendCaption}
				onSignal={engine.sendSignal}
				onSubmitVerse={engine.submitVerse}
				onLeave={engine.leave}
			/>
		);
	}

	if (state.view === "searching") {
		return <SearchingScreen modality={modality} onCancel={engine.cancelSearch} />;
	}

	return (
		<SetupScreen
			error={state.error}
			media={media}
			session={rapSession.session}
			onSearch={(identity, m, beatId) => {
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
				engine.search(nextSession, m, beatId);
			}}
		/>
	);
}
