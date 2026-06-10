"use client";

import { useEffect, useRef } from "react";

const PLAYBACK_RATE = 1.5;

export function HeroVideo() {
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		const applyRate = () => {
			video.defaultPlaybackRate = PLAYBACK_RATE;
			video.playbackRate = PLAYBACK_RATE;
		};

		applyRate();

		for (const event of ["loadedmetadata", "canplay", "play", "playing"] as const) {
			video.addEventListener(event, applyRate);
		}

		return () => {
			for (const event of ["loadedmetadata", "canplay", "play", "playing"] as const) {
				video.removeEventListener(event, applyRate);
			}
		};
	}, []);

	return (
		<video
			ref={videoRef}
			className="absolute inset-0 h-full w-full object-cover"
			autoPlay
			muted
			playsInline
			preload="auto"
			aria-hidden="true"
		>
			<source src="/herovideo.mp4" type="video/mp4" />
		</video>
	);
}
