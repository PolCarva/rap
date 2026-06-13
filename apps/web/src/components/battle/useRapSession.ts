"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { parseAvatarConfig, type AvatarConfig } from "@rap/shared";

export interface RapSession {
	sessionId: string;
	userId: string | null;
	name: string;
	isGuest: boolean;
	email: string | null;
	avatarConfig: AvatarConfig | null;
}

const KEY = "rap-arena-session-v1";

function freshSession(): RapSession {
	return {
		sessionId: crypto.randomUUID(),
		userId: null,
		name: "",
		isGuest: true,
		email: null,
		avatarConfig: null,
	};
}

export function userIdFromEmail(email: string): string {
	return `local:${email.trim().toLowerCase()}`;
}

function readSession(): RapSession {
	if (typeof window === "undefined") return freshSession();
	try {
		const raw = window.localStorage.getItem(KEY);
		if (!raw) return freshSession();
		const parsed = JSON.parse(raw) as Partial<RapSession>;
		return {
			sessionId: parsed.sessionId ?? crypto.randomUUID(),
			userId: parsed.userId ?? null,
			name: parsed.name ?? "",
			isGuest: parsed.isGuest ?? true,
			email: parsed.email ?? null,
			avatarConfig: parsed.avatarConfig ?? null,
		};
	} catch {
		return freshSession();
	}
}

export type AuthState = "idle" | "loading" | "error";

export interface RapSessionContextValue {
	session: RapSession;
	authState: AuthState;
	authError: string | null;
	enterAsGuest: (name: string) => void;
	loginLocal: (name: string, email: string) => void;
	loginWithPassword: (email: string, password: string) => Promise<boolean>;
	register: (name: string, email: string, password: string) => Promise<boolean>;
	updateHandle: (handle: string) => Promise<boolean>;
	updateAvatar: (config: AvatarConfig) => Promise<boolean>;
	refresh: () => Promise<void>;
	logout: () => Promise<void>;
}

const RapSessionContext = createContext<RapSessionContextValue | null>(null);

function useRapSessionState(): RapSessionContextValue {
	const [session, setSession] = useState<RapSession>(() => freshSession());
	const [authState, setAuthState] = useState<AuthState>("idle");
	const [authError, setAuthError] = useState<string | null>(null);

	// Hydrate from localStorage
	useEffect(() => {
		setSession(readSession());
	}, []);

	// Persist to localStorage whenever session changes
	useEffect(() => {
		window.localStorage.setItem(KEY, JSON.stringify(session));
	}, [session]);

	// Check server session cookie on mount
	const refresh = useCallback(async () => {
		await fetch("/api/auth/me")
			.then((r) => r.json() as Promise<{ user: { id: string; handle: string; email: string | null; avatarConfig?: string | null } | null }>)
			.then(({ user }) => {
				if (user) {
					setSession((s) => ({
						...s,
						userId: user.id,
						name: user.handle.toUpperCase(),
						isGuest: false,
						email: user.email,
						avatarConfig: user.avatarConfig != null ? parseAvatarConfig(user.avatarConfig) : s.avatarConfig,
					}));
				}
			})
			.catch(() => {});
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const enterAsGuest = useCallback((name: string) => {
		setSession((current) => ({
			...current,
			name,
			userId: null,
			isGuest: true,
			email: null,
		}));
	}, []);

	const loginLocal = useCallback((name: string, email: string) => {
		setSession((current) => ({
			...current,
			name,
			userId: userIdFromEmail(email),
			isGuest: false,
			email: email.trim().toLowerCase(),
		}));
	}, []);

	const register = useCallback(async (name: string, email: string, password: string): Promise<boolean> => {
		setAuthState("loading");
		setAuthError(null);
		try {
			const res = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email, password }),
			});
			const data = (await res.json()) as { id?: string; handle?: string; error?: string };
			if (!res.ok) {
				setAuthError(data.error ?? "Error al registrarse");
				setAuthState("error");
				return false;
			}
			setSession((s) => ({
				...s,
				userId: data.id!,
				name: (data.handle ?? name).toUpperCase(),
				isGuest: false,
				email: email.trim().toLowerCase(),
			}));
			setAuthState("idle");
			return true;
		} catch {
			setAuthError("Error de conexión");
			setAuthState("error");
			return false;
		}
	}, []);

	const loginWithPassword = useCallback(async (email: string, password: string): Promise<boolean> => {
		setAuthState("loading");
		setAuthError(null);
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			});
			const data = (await res.json()) as { id?: string; handle?: string; email?: string; error?: string };
			if (!res.ok) {
				setAuthError(data.error ?? "Credenciales incorrectas");
				setAuthState("error");
				return false;
			}
			setSession((s) => ({
				...s,
				userId: data.id!,
				name: (data.handle ?? email).toUpperCase(),
				isGuest: false,
				email: data.email ?? email.trim().toLowerCase(),
			}));
			setAuthState("idle");
			return true;
		} catch {
			setAuthError("Error de conexión");
			setAuthState("error");
			return false;
		}
	}, []);

	const updateHandle = useCallback(async (handle: string): Promise<boolean> => {
		setAuthState("loading");
		setAuthError(null);
		try {
			const res = await fetch("/api/auth/profile", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ handle }),
			});
			const data = (await res.json()) as { handle?: string; error?: string };
			if (!res.ok) {
				setAuthError(data.error ?? "No se pudo actualizar el AKA");
				setAuthState("error");
				return false;
			}
			setSession((s) => ({
				...s,
				name: (data.handle ?? handle).toUpperCase(),
				isGuest: false,
			}));
			setAuthState("idle");
			return true;
		} catch {
			setAuthError("Error de conexión");
			setAuthState("error");
			return false;
		}
	}, []);

	const updateAvatar = useCallback(async (config: AvatarConfig): Promise<boolean> => {
		setAuthState("loading");
		setAuthError(null);
		try {
			const res = await fetch("/api/auth/avatar", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(config),
			});
			const data = (await res.json()) as { avatarConfig?: AvatarConfig; error?: string };
			if (!res.ok) {
				setAuthError(data.error ?? "No se pudo guardar el avatar");
				setAuthState("error");
				return false;
			}
			setSession((s) => ({ ...s, avatarConfig: data.avatarConfig ?? config }));
			setAuthState("idle");
			return true;
		} catch {
			setAuthError("Error de conexión");
			setAuthState("error");
			return false;
		}
	}, []);

	const logout = useCallback(async () => {
		await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
		setSession(freshSession());
		setAuthError(null);
		setAuthState("idle");
	}, []);

	return {
		session,
		authState,
		authError,
		enterAsGuest,
		loginLocal,
		loginWithPassword,
		register,
		updateHandle,
		updateAvatar,
		refresh,
		logout,
	};
}

export function RapSessionProvider({ children }: { children: ReactNode }) {
	const value = useRapSessionState();
	return createElement(RapSessionContext.Provider, { value }, children);
}

export function useRapSession(): RapSessionContextValue {
	const context = useContext(RapSessionContext);
	if (!context) throw new Error("useRapSession debe usarse dentro de RapSessionProvider");
	return context;
}
