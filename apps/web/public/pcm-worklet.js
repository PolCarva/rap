// AudioWorklet: convierte el audio del micrófono (Float32) a PCM lineal de 16
// bits (Int16) y lo envía al hilo principal, que lo manda a Deepgram por WS.
class PCMProcessor extends AudioWorkletProcessor {
	process(inputs) {
		const input = inputs[0];
		const channel = input && input[0];
		if (channel && channel.length) {
			const pcm = new Int16Array(channel.length);
			for (let i = 0; i < channel.length; i++) {
				const s = Math.max(-1, Math.min(1, channel[i]));
				pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
			}
			this.port.postMessage(pcm.buffer, [pcm.buffer]);
		}
		return true;
	}
}

registerProcessor("pcm-processor", PCMProcessor);
