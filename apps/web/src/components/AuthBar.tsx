"use client";

import Link from "next/link";
import { useState } from "react";
import { avatarFromSeed } from "@rap/shared";
import { useRapSession } from "@/components/battle/useRapSession";
import { RapperAvatar } from "@/components/avatar/RapperAvatar";

type Mode = "login" | "signup";

export function AuthBar() {
	const session = useRapSession();
	const [mode, setMode] = useState<Mode | null>(null);

	if (!session.session.isGuest && session.session.userId) {
		return (
			<div className="auth-bar">
				<Link href={`/perfil/${encodeURIComponent(session.session.userId)}`} className="auth-profile">
					<RapperAvatar
						config={session.session.avatarConfig ?? avatarFromSeed(session.session.userId)}
						size={32}
						ring={false}
					/>
					<span>{session.session.name || "Perfil"}</span>
				</Link>
				<button onClick={session.logout} className="auth-link logout buttonish">
					Salir
				</button>
			</div>
		);
	}

	return (
		<div className="auth-bar">
			<button onClick={() => setMode("login")} className="auth-action buttonish">
				Login
			</button>
			<button onClick={() => setMode("signup")} className="auth-action primary buttonish">
				Signup
			</button>
			{mode && <AuthDialog mode={mode} onMode={setMode} onClose={() => setMode(null)} />}
		</div>
	);
}

function AuthDialog({
	mode,
	onMode,
	onClose,
}: {
	mode: Mode;
	onMode: (mode: Mode) => void;
	onClose: () => void;
}) {
	const session = useRapSession();
	const [aka, setAka] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const isSignup = mode === "signup";
	const disabled =
		session.authState === "loading" ||
		!email.trim() ||
		!password ||
		(isSignup && (!aka.trim() || password.length < 6 || password !== confirm));

	const submit = async () => {
		const ok = isSignup
			? await session.register(aka.trim(), email.trim(), password)
			: await session.loginWithPassword(email.trim(), password);
		if (ok) onClose();
	};

	return (
		<div className="auth-popover" role="dialog" aria-modal="true">
			<div className="auth-popover-head">
				<button className={mode === "login" ? "active" : ""} onClick={() => onMode("login")}>
					Login
				</button>
				<button className={mode === "signup" ? "active" : ""} onClick={() => onMode("signup")}>
					Signup
				</button>
				<button className="close" onClick={onClose} aria-label="Cerrar">
					X
				</button>
			</div>
			<div className="auth-popover-body">
				{isSignup && (
					<input
						value={aka}
						onChange={(e) => setAka(e.target.value.toUpperCase())}
						placeholder="AKA"
						maxLength={30}
						autoComplete="username"
					/>
				)}
				<input
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="email"
					type="email"
					autoComplete="email"
				/>
				<input
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="password"
					type="password"
					autoComplete={isSignup ? "new-password" : "current-password"}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !disabled) submit();
					}}
				/>
				{isSignup && (
					<input
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						placeholder="confirmar password"
						type="password"
						autoComplete="new-password"
						onKeyDown={(e) => {
							if (e.key === "Enter" && !disabled) submit();
						}}
					/>
				)}
				{session.authError && <p className="auth-error">{session.authError}</p>}
				<button disabled={disabled} onClick={submit} className="btn-arena auth-submit">
					<span>{session.authState === "loading" ? "Procesando" : isSignup ? "Crear cuenta" : "Entrar"}</span>
				</button>
			</div>
		</div>
	);
}
