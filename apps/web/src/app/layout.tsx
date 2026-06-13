import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono, Oswald } from "next/font/google";
import { RapSessionProvider } from "@/components/battle/useRapSession";
import { CinematicCursor } from "@/components/fx/CinematicCursor";
import { PageTransitionProvider } from "@/components/fx/PageTransition";
import {
	absoluteUrl,
	jsonLd,
	SEO_KEYWORDS,
	siteGraphJsonLd,
	SITE_DESCRIPTION,
	SITE_LANGUAGE,
	SITE_LOCALE,
	SITE_NAME,
	SITE_TAGLINE,
	SITE_URL,
} from "@/lib/seo";
import "./globals.css";

const anton = Anton({
	subsets: ["latin"],
	weight: "400",
	display: "swap",
	variable: "--font-anton",
});

const oswald = Oswald({
	subsets: ["latin"],
	weight: ["300", "400", "500", "600"],
	display: "swap",
	variable: "--font-oswald",
});

const ibmPlexMono = IBM_Plex_Mono({
	subsets: ["latin"],
	weight: ["400", "500", "700"],
	display: "swap",
	variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: `${SITE_NAME} - ${SITE_TAGLINE}`,
		template: `%s | ${SITE_NAME}`,
	},
	description: SITE_DESCRIPTION,
	applicationName: SITE_NAME,
	generator: "Next.js",
	referrer: "origin-when-cross-origin",
	keywords: SEO_KEYWORDS,
	authors: [{ name: SITE_NAME, url: SITE_URL }],
	creator: SITE_NAME,
	publisher: SITE_NAME,
	category: "music",
	alternates: {
		canonical: "/",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-image-preview": "large",
			"max-snippet": -1,
			"max-video-preview": -1,
		},
	},
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "64x64" },
			{ url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
			{ url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
			{ url: "/icon.svg", type: "image/svg+xml" },
			{ url: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ url: "/icon-512.png", sizes: "512x512", type: "image/png" },
		],
		shortcut: "/favicon.ico",
		apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
		other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#e8192c" }],
	},
	manifest: "/site.webmanifest",
	openGraph: {
		title: `${SITE_NAME} - ${SITE_TAGLINE}`,
		description: SITE_DESCRIPTION,
		url: SITE_URL,
		siteName: SITE_NAME,
		locale: SITE_LOCALE,
		type: "website",
		images: [
			{
				url: absoluteUrl("/og-image.png"),
				width: 1200,
				height: 630,
				alt: `${SITE_NAME} - ${SITE_TAGLINE}`,
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: `${SITE_NAME} - ${SITE_TAGLINE}`,
		description: SITE_DESCRIPTION,
		images: [absoluteUrl("/twitter-image.png")],
	},
	appleWebApp: {
		capable: true,
		title: SITE_NAME,
		statusBarStyle: "black-translucent",
	},
	formatDetection: {
		telephone: false,
	},
	other: {
		"msapplication-TileColor": "#08080b",
		"msapplication-config": "/browserconfig.xml",
	},
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	colorScheme: "dark",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#08080b" },
		{ media: "(prefers-color-scheme: dark)", color: "#08080b" },
	],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang={SITE_LANGUAGE} className={`${anton.variable} ${oswald.variable} ${ibmPlexMono.variable}`}>
			<head>
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: jsonLd(siteGraphJsonLd()) }}
				/>
			</head>
			<body>
				<RapSessionProvider>
					<PageTransitionProvider>{children}</PageTransitionProvider>
				</RapSessionProvider>
				<CinematicCursor />
			</body>
		</html>
	);
}
