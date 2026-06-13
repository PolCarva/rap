import type { Metadata } from "next";

export const SITE_NAME = "Rapear Online";
export const SITE_TAGLINE = "Batallas de freestyle online 1 vs 1";
export const SITE_DESCRIPTION =
	"Batallá freestyle online en vivo: matchmaking 1 vs 1, beats, ranking ELO, perfiles, historial y veredictos de un juez IA.";
export const SITE_LOCALE = "es_UY";
export const SITE_LANGUAGE = "es-UY";
export const DEFAULT_SITE_URL = "https://rapear.online";

export const SEO_KEYWORDS = [
	"Rapear Online",
	"batallas de freestyle",
	"freestyle online",
	"batallas de rap online",
	"rap en vivo",
	"juez IA",
	"ranking ELO freestyle",
	"1 vs 1 rap",
	"MCs online",
	"beats freestyle",
	"underground freestyle league",
];

export const SITE_NAVIGATION = [
	{ name: "Arena", path: "/arena" },
	{ name: "Ranking", path: "/ranking" },
	{ name: "Batallas", path: "/batallas" },
] as const;

function normalizeSiteUrl(input: string | undefined): string {
	const raw = (input ?? DEFAULT_SITE_URL).trim().replace(/\/+$/, "");
	try {
		return new URL(raw).origin;
	} catch {
		return DEFAULT_SITE_URL;
	}
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export function absoluteUrl(path = "/"): string {
	if (/^https?:\/\//i.test(path)) return path;
	return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function fullTitle(title?: string): string {
	return title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - ${SITE_TAGLINE}`;
}

export function createPageMetadata({
	title,
	description = SITE_DESCRIPTION,
	path = "/",
	image = "/og-image.png",
	imageAlt,
	keywords = [],
	noIndex = false,
}: {
	title?: string;
	description?: string;
	path?: string;
	image?: string;
	imageAlt?: string;
	keywords?: string[];
	noIndex?: boolean;
}): Metadata {
	const canonical = absoluteUrl(path);
	const resolvedTitle = fullTitle(title);
	const resolvedImage = absoluteUrl(image);

	return {
		title,
		description,
		keywords: [...SEO_KEYWORDS, ...keywords],
		alternates: {
			canonical,
		},
		robots: noIndex
			? {
					index: false,
					follow: false,
					googleBot: {
						index: false,
						follow: false,
					},
				}
			: undefined,
		openGraph: {
			title: resolvedTitle,
			description,
			url: canonical,
			siteName: SITE_NAME,
			locale: SITE_LOCALE,
			type: "website",
			images: [
				{
					url: resolvedImage,
					width: 1200,
					height: 630,
					alt: imageAlt ?? resolvedTitle,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: resolvedTitle,
			description,
			images: [resolvedImage],
		},
	};
}

export function jsonLd(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function siteGraphJsonLd() {
	return {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "WebSite",
				"@id": absoluteUrl("/#website"),
				name: SITE_NAME,
				alternateName: "Rapear Online Freestyle",
				url: SITE_URL,
				description: SITE_DESCRIPTION,
				inLanguage: SITE_LANGUAGE,
			},
			{
				"@type": "Organization",
				"@id": absoluteUrl("/#organization"),
				name: SITE_NAME,
				url: SITE_URL,
				logo: absoluteUrl("/icon-512.png"),
			},
			{
				"@type": "WebApplication",
				"@id": absoluteUrl("/#app"),
				name: SITE_NAME,
				url: SITE_URL,
				applicationCategory: "GameApplication",
				operatingSystem: "Web",
				isAccessibleForFree: true,
				inLanguage: SITE_LANGUAGE,
				description: SITE_DESCRIPTION,
				offers: {
					"@type": "Offer",
					price: "0",
					priceCurrency: "USD",
				},
			},
			{
				"@type": "ItemList",
				"@id": absoluteUrl("/#navigation"),
				name: "Navegacion principal",
				itemListElement: SITE_NAVIGATION.map((item, index) => ({
					"@type": "SiteNavigationElement",
					position: index + 1,
					name: item.name,
					url: absoluteUrl(item.path),
				})),
			},
		],
	};
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: absoluteUrl(item.path),
		})),
	};
}
