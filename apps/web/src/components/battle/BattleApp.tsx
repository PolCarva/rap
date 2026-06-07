"use client";

import type { ModalityId } from "@rap/shared";
import { useState } from "react";
import { BattleStage } from "./BattleStage";
import { SearchingScreen } from "./SearchingScreen";
import { SetupScreen } from "./SetupScreen";
import { useBattleEngine } from "./useBattleEngine";
import { useMediaStream } from "./useMediaStream";

export function BattleApp() {
	const engine = useBattleEngine();
	// El stream vive acá para persistir entre setup y la batalla.
	const media = useMediaStream();
	const [modality, setModality] = useState<ModalityId>("minuto-libre");
	const { state } = engine;

	if (state.view === "battle" && state.battle && state.myRole) {
		return (
			<BattleStage
				battle={state.battle}
				myRole={state.myRole}
				opponentCaption={state.opponentCaption}
				media={media}
				onReady={engine.sendReady}
				onCaption={engine.sendCaption}
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
			onSearch={(name, m) => {
				setModality(m);
				engine.search(name, m);
			}}
		/>
	);
}
