"use client";

import { useEffect, useRef, useState } from "react";
import { getRealtimeHttpUrl } from "@/lib/realtime";

export interface PlayerCounts {
	total: number;
	byModality: Record<string, number>;
}

/** Polls /stats every 5 s and returns live player counts. */
export function usePlayerCounts(): PlayerCounts {
	const [counts, setCounts] = useState<PlayerCounts>({ total: 0, byModality: {} });
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		async function fetch_() {
			try {
				const res = await fetch(`${getRealtimeHttpUrl()}/stats`);
				if (res.ok) setCounts(await res.json());
			} catch {
				// Counts are decorative; keep the last known value.
			}
		}
		fetch_();
		timerRef.current = setInterval(fetch_, 5000);
		return () => { if (timerRef.current) clearInterval(timerRef.current); };
	}, []);

	return counts;
}
