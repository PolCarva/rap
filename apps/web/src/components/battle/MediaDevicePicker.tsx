"use client";

import type { MediaController, MediaRequirements } from "./useMediaStream";

interface Props {
	media: MediaController;
	requirements: MediaRequirements;
}

function deviceLabel(device: MediaDeviceInfo, index: number, fallback: string): string {
	return device.label || `${fallback} ${index + 1}`;
}

export function MediaDevicePicker({ media, requirements }: Props) {
	const audioInputs = media.devices.filter((device) => device.kind === "audioinput");
	const videoInputs = media.devices.filter((device) => device.kind === "videoinput");
	const busy = media.status === "requesting";

	return (
		<div className="device-picker">
			<label className="device-field">
				<span>Micrófono</span>
				<select
					className="device-select"
					value={media.selectedAudioId}
					disabled={busy || !requirements.audio}
					onChange={(event) => void media.selectAudioDevice(event.target.value, requirements)}
				>
					<option value="">Micrófono del sistema</option>
					{audioInputs.map((device, index) => (
						<option key={device.deviceId || `audio-${index}`} value={device.deviceId}>
							{deviceLabel(device, index, "Micrófono")}
						</option>
					))}
				</select>
			</label>

			<label className="device-field">
				<span>Cámara</span>
				<select
					className="device-select"
					value={requirements.video ? media.selectedVideoId : "__off"}
					disabled={busy || !requirements.video}
					onChange={(event) => void media.selectVideoDevice(event.target.value, requirements)}
				>
					{!requirements.video && <option value="__off">Cámara apagada</option>}
					<option value="">Cámara del sistema</option>
					{videoInputs.map((device, index) => (
						<option key={device.deviceId || `video-${index}`} value={device.deviceId}>
							{deviceLabel(device, index, "Cámara")}
						</option>
					))}
				</select>
			</label>
		</div>
	);
}
