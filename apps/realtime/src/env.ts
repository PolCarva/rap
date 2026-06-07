export interface Env {
	/** Singleton que empareja jugadores por modalidad. */
	MATCHMAKING: DurableObjectNamespace;
	/** Una instancia por batalla: máquina de estados + señalización. */
	BATTLE_ROOM: DurableObjectNamespace;
	/** Secret: API key de Deepgram para la transcripción en vivo. */
	DEEPGRAM_API_KEY?: string;
}
