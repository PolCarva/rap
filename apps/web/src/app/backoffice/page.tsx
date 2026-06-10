"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Beat } from "@rap/shared";
import { AppNav } from "@/components/AppNav";

const KEY = "rap-arena-backoffice-key";

interface BeatForm {
	id?: string;
	name: string;
	producer: string;
	audioUrl: string;
	bpm: string;
	isActive: boolean;
}

const EMPTY: BeatForm = {
	name: "",
	producer: "",
	audioUrl: "",
	bpm: "",
	isActive: true,
};

export default function BackofficePage() {
	const [key, setKey] = useState("");
	const [beats, setBeats] = useState<Beat[]>([]);
	const [form, setForm] = useState<BeatForm>(EMPTY);
	const [status, setStatus] = useState("");
	const activeCount = useMemo(() => beats.filter((beat) => beat.isActive).length, [beats]);

	const headers = useCallback((nextKey = key) => ({
		"Content-Type": "application/json",
		"x-backoffice-key": nextKey,
	}), [key]);

	const load = useCallback(async (nextKey = key) => {
		setStatus("Cargando");
		const res = await fetch("/api/backoffice/beats", { headers: headers(nextKey) });
		const data = (await res.json()) as { beats?: Beat[]; error?: string };
		if (!res.ok) {
			setStatus(data.error ?? "No autorizado");
			return;
		}
		window.localStorage.setItem(KEY, nextKey);
		setBeats(data.beats ?? []);
		setStatus("");
	}, [headers, key]);

	useEffect(() => {
		const stored = window.localStorage.getItem(KEY);
		if (stored) {
			setKey(stored);
			load(stored);
		}
	}, [load]);

	const submit = async () => {
		const body = {
			id: form.id,
			name: form.name.trim(),
			producer: form.producer.trim() || null,
			audioUrl: form.audioUrl.trim(),
			bpm: form.bpm.trim() ? Number(form.bpm) : null,
			isActive: form.isActive,
		};
		const res = await fetch("/api/backoffice/beats", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify(body),
		});
		const data = (await res.json()) as { error?: string };
		if (!res.ok) {
			setStatus(data.error ?? "No se pudo guardar");
			return;
		}
		setForm(EMPTY);
		await load();
	};

	const edit = (beat: Beat) => {
		setForm({
			id: beat.id,
			name: beat.name,
			producer: beat.producer ?? "",
			audioUrl: beat.audioUrl,
			bpm: beat.bpm?.toString() ?? "",
			isActive: beat.isActive,
		});
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	const remove = async (id: string) => {
		const res = await fetch(`/api/backoffice/beats?id=${encodeURIComponent(id)}`, {
			method: "DELETE",
			headers: headers(),
		});
		if (!res.ok) {
			const data = (await res.json()) as { error?: string };
			setStatus(data.error ?? "No se pudo borrar");
			return;
		}
		await load();
	};

	return (
		<main className="app-page-shell">
			<AppNav status={`${activeCount} BEATS ACTIVOS`} />
			<div className="backoffice-shell">
			<header className="backoffice-header">
				<div>
					<p>{activeCount} beats activos</p>
					<h1>Backoffice Beats</h1>
				</div>
			</header>

			<section className="backoffice-key">
				<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="BACKOFFICE_PASSWORD" type="password" />
				<button className="btn-ghost" onClick={() => load()}>
					Entrar
				</button>
			</section>

			<section className="backoffice-form">
				<div className="form-row">
					<input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre del beat" />
					<input value={form.producer} onChange={(e) => setForm((f) => ({ ...f, producer: e.target.value }))} placeholder="Producer" />
					<input value={form.bpm} onChange={(e) => setForm((f) => ({ ...f, bpm: e.target.value.replace(/\D/g, "") }))} placeholder="BPM" inputMode="numeric" />
				</div>
				<input value={form.audioUrl} onChange={(e) => setForm((f) => ({ ...f, audioUrl: e.target.value }))} placeholder="https://..." />
				<label className="backoffice-check">
					<input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
					Activo
				</label>
				<div className="backoffice-actions">
					<button className="btn-arena" onClick={submit} disabled={!key || !form.name.trim() || !form.audioUrl.trim()}>
						<span>{form.id ? "Actualizar" : "Agregar"}</span>
					</button>
					{form.id && (
						<button className="btn-ghost" onClick={() => setForm(EMPTY)}>
							Cancelar
						</button>
					)}
				</div>
				{status && <p className="backoffice-status">{status}</p>}
			</section>

			<section className="backoffice-list">
				{beats.map((beat) => (
					<article key={beat.id} className={`backoffice-beat${beat.isActive ? " active" : ""}`}>
						<div>
							<h2>{beat.name}</h2>
							<p>
								{beat.producer ?? "Sin producer"} {beat.bpm ? `· ${beat.bpm} BPM` : ""} · {beat.isActive ? "Activo" : "Pausado"}
							</p>
							<a href={beat.audioUrl} target="_blank" rel="noreferrer">
								{beat.audioUrl}
							</a>
						</div>
						<div className="backoffice-beat-actions">
							<button className="btn-ghost" onClick={() => edit(beat)}>
								Editar
							</button>
							<button className="btn-ghost" onClick={() => remove(beat.id)}>
								Borrar
							</button>
						</div>
					</article>
				))}
			</section>
			</div>
		</main>
	);
}
