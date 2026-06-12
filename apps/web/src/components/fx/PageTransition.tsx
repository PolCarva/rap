"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	type AnchorHTMLAttributes,
	type ReactNode,
} from "react";

/**
 * Transición cinemática entre rutas: lamas diagonales rojas barren la pantalla
 * al salir y se abren al entrar. TransitionLink dispara la salida antes de
 * navegar; el cambio de pathname dispara la apertura.
 */

type Phase = "idle" | "leaving" | "entering";

const TransitionContext = createContext<{ navigate: (href: string) => void; phase: Phase }>({
	navigate: () => {},
	phase: "idle",
});

const LEAVE_MS = 750;
const ENTER_MS = 750;
const SLATS = 5;

export function PageTransitionProvider({ children }: { children: ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const [phase, setPhase] = useState<Phase>("idle");
	const pendingHref = useRef<string | null>(null);
	const lastPath = useRef(pathname);

	const navigate = useCallback(
		(href: string) => {
			if (href === pathname || phase === "leaving") return;
			pendingHref.current = href;
			setPhase("leaving");
			window.setTimeout(() => {
				router.push(href);
			}, LEAVE_MS);
		},
		[pathname, phase, router],
	);

	// Llegó la ruta nueva: abrir las lamas.
	useEffect(() => {
		if (pathname !== lastPath.current) {
			lastPath.current = pathname;
			pendingHref.current = null;
			setPhase("entering");
			const id = window.setTimeout(() => setPhase("idle"), ENTER_MS);
			return () => window.clearTimeout(id);
		}
	}, [pathname]);

	return (
		<TransitionContext.Provider value={{ navigate, phase }}>
			{children}
			<div className={`pt-overlay ${phase}`} aria-hidden="true">
				{Array.from({ length: SLATS }, (_, i) => (
					<span key={i} className="pt-slat" style={{ transitionDelay: `${i * 55}ms` }} />
				))}
				<span className="pt-tag">RAP ARENA</span>
			</div>
		</TransitionContext.Provider>
	);
}

export function usePageTransition() {
	return useContext(TransitionContext);
}

type TransitionLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
	href: string;
	children: ReactNode;
};

/** Link que navega con la transición cinemática. Drop-in de <Link>. */
export function TransitionLink({ href, children, onClick, ...rest }: TransitionLinkProps) {
	const { navigate } = usePageTransition();
	return (
		<Link
			href={href}
			{...rest}
			onClick={(e) => {
				onClick?.(e);
				if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
				e.preventDefault();
				navigate(href);
			}}
		>
			{children}
		</Link>
	);
}
