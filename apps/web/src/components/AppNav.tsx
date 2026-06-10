"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthBar } from "@/components/AuthBar";
import { usePlayerCounts } from "@/components/usePlayerCounts";

const LINKS = [
	{ href: "/arena", label: "Arena" },
	{ href: "/ranking", label: "Ranking" },
	{ href: "/batallas", label: "Historial" },
];

export function AppNav({ status }: { status?: string }) {
	const pathname = usePathname();
	const counts = usePlayerCounts();
	const liveText = status ?? `${counts.total > 0 ? counts.total : "-"} MCS EN LINEA`;

	return (
		<header className="app-nav">
			<Link href="/" className="arena-wordmark app-nav-brand">
				<span className="tick">▮▮</span>RAP ARENA
			</Link>
			<div className="app-nav-status">
				<span className="arena-live-dot" />
				<span>{liveText}</span>
			</div>
			<nav className="app-nav-links" aria-label="Navegación principal">
				{LINKS.map((link) => (
					<Link
						key={link.href}
						href={link.href}
						className={pathname === link.href || pathname.startsWith(`${link.href}/`) ? "active" : ""}
					>
						{link.label}
					</Link>
				))}
				<AuthBar />
			</nav>
		</header>
	);
}
