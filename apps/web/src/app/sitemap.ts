import type { MetadataRoute } from "next";
import { getRanking } from "@/lib/data";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

const STATIC_ROUTES = [
	{ path: "/", changeFrequency: "daily", priority: 1 },
	{ path: "/arena", changeFrequency: "daily", priority: 0.95 },
	{ path: "/ranking", changeFrequency: "hourly", priority: 0.9 },
	{ path: "/batallas", changeFrequency: "hourly", priority: 0.85 },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const now = new Date();
	const ranking = await getRanking(50);

	return [
		...STATIC_ROUTES.map((route) => ({
			url: absoluteUrl(route.path),
			lastModified: now,
			changeFrequency: route.changeFrequency,
			priority: route.priority,
		})),
		...ranking.map((mc) => ({
			url: absoluteUrl(`/perfil/${encodeURIComponent(mc.handle)}`),
			lastModified: now,
			changeFrequency: "daily" as const,
			priority: 0.65,
		})),
	];
}
