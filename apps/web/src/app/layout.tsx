import type { Metadata } from "next";
import { RapSessionProvider } from "@/components/battle/useRapSession";
import { CinematicCursor } from "@/components/fx/CinematicCursor";
import { PageTransitionProvider } from "@/components/fx/PageTransition";
import "./globals.css";

export const metadata: Metadata = {
	title: "Rap Arena — batallas de freestyle",
	description: "Buscá batalla, rapeá en vivo y que decida el juez IA.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="es">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link
					href="https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500;700&display=swap"
					rel="stylesheet"
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
