"use client";

import type { ModalityId } from "@rap/shared";
import { useState } from "react";
import { useMediaStream } from "@/components/battle/useMediaStream";
import { PracticeSetup, type PracticeConfig } from "./PracticeSetup";
import { PracticeStage } from "./PracticeStage";

export function PracticeApp({ initialModality = "minuto-libre" }: { initialModality?: ModalityId }) {
	const media = useMediaStream();
	const [config, setConfig] = useState<PracticeConfig | null>(null);
	// Cambia con cada "otra vez" para remontar el stage (sortea palabras nuevas).
	const [runId, setRunId] = useState(0);

	if (config) {
		return (
			<PracticeStage
				key={runId}
				config={config}
				media={media}
				onRestart={() => setRunId((n) => n + 1)}
				onExit={() => setConfig(null)}
			/>
		);
	}

	return <PracticeSetup initialModality={initialModality} media={media} onStart={setConfig} />;
}
