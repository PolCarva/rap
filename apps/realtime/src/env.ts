export interface Env {
	/** Singleton que empareja jugadores por modalidad. */
	MATCHMAKING: DurableObjectNamespace;
	/** Una instancia por batalla: máquina de estados + señalización. */
	BATTLE_ROOM: DurableObjectNamespace;
	/** D1 opcional para usuarios, ranking, batallas y veredictos. */
	DB?: D1Database;
	/** Secret: API key de Deepgram para la transcripción en vivo. */
	DEEPGRAM_API_KEY?: string;
	/** Secret: API key de OpenRouter para el juez IA. */
	OPENROUTER_API_KEY?: string;
	/** Modelo del juez en OpenRouter (default: openai/gpt-4o). */
	OPENROUTER_JUDGE_MODEL?: string;
}
