"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Beat } from "@rap/shared";
import { AppNav } from "@/components/AppNav";
import { detectBpmFromUrl, isSoundCloudUrl } from "@/lib/bpm";

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
	const [file, setFile] = useState<File | null>(null);
	const [status, setStatus] = useState("");
	const [detecting, setDetecting] = useState(false);
	const [uploading, setUploading] = useState(false);

	const detectBpm = async () => {
		const url = form.audioUrl.trim();
		if (!url) {
			setStatus("Pegá primero la URL del audio");
			return;
		}
		if (isSoundCloudUrl(url)) {
			setStatus("SoundCloud no expone el audio crudo para detectar BPM; cargalo a mano");
			return;
		}
		setDetecting(true);
		setStatus("Analizando BPM…");
		try {
			const bpm = await detectBpmFromUrl(url);
			if (bpm) {
				setForm((f) => ({ ...f, bpm: String(bpm) }));
				setStatus(`BPM detectado: ${bpm}`);
			} else {
				setStatus("No se pudo detectar un pulso claro; cargalo a mano");
			}
		} catch {
			setStatus("No se pudo analizar el audio (¿CORS o URL inválida?)");
		} finally {
			setDetecting(false);
		}
	};
	const activeCount = useMemo(() => beats.filter((beat) => beat.isActive).length, [beats]);

	const authHeaders = useCallback((nextKey = key) => ({
		"x-backoffice-key": nextKey,
	}), [key]);

	const jsonHeaders = useCallback((nextKey = key) => ({
		...authHeaders(nextKey),
		"Content-Type": "application/json",
	}), [authHeaders, key]);

	const load = useCallback(async (nextKey = key) => {
		setStatus("Cargando");
		const res = await fetch("/api/backoffice/beats", { headers: jsonHeaders(nextKey) });
		const data = (await res.json()) as { beats?: Beat[]; error?: string };
		if (!res.ok) {
			setStatus(data.error ?? "No autorizado");
			return;
		}
		window.localStorage.setItem(KEY, nextKey);
		setBeats(data.beats ?? []);
		setStatus("");
	}, [jsonHeaders, key]);

	useEffect(() => {
		const stored = window.localStorage.getItem(KEY);
		if (stored) {
			setKey(stored);
			load(stored);
		}
	}, [load]);

	const uploadFile = async (): Promise<string | null> => {
		if (!file) return form.audioUrl.trim();
		const body = new FormData();
		body.append("file", file);
		setUploading(true);
		setStatus("Subiendo MP3");
		try {
			const res = await fetch("/api/backoffice/beats/upload", {
				method: "POST",
				headers: authHeaders(),
				body,
			});
			const data = (await res.json()) as { audioUrl?: string; error?: string };
			if (!res.ok || !data.audioUrl) {
				setStatus(data.error ?? "No se pudo subir el MP3");
				return null;
			}
			return data.audioUrl;
		} finally {
			setUploading(false);
		}
	};

	const submit = async () => {
		const audioUrl = await uploadFile();
		if (!audioUrl) return;
		const body = {
			id: form.id,
			name: form.name.trim(),
			producer: form.producer.trim() || null,
			audioUrl,
			bpm: form.bpm.trim() ? Number(form.bpm) : null,
			isActive: form.isActive,
		};
		const res = await fetch("/api/backoffice/beats", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify(body),
		});
		const data = (await res.json()) as { error?: string };
		if (!res.ok) {
			setStatus(data.error ?? "No se pudo guardar");
			return;
		}
		setForm(EMPTY);
		setFile(null);
		await load();
	};

	const pickFile = (nextFile: File | null) => {
		setFile(nextFile);
		if (!nextFile) return;
		setForm((f) => ({
			...f,
			name: f.name.trim() || nextFile.name.replace(/\.[^.]+$/, ""),
			audioUrl: "",
		}));
		setStatus(`MP3 listo para subir: ${nextFile.name}`);
	};

	const edit = (beat: Beat) => {
		setFile(null);
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
			headers: jsonHeaders(),
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
					<button className="btn-ghost" onClick={detectBpm} disabled={detecting || !form.audioUrl.trim()}>
						{detecting ? "Analizando…" : "Detectar BPM"}
					</button>
				</div>
				<input
					value={form.audioUrl}
					onChange={(e) => {
						setFile(null);
						setForm((f) => ({ ...f, audioUrl: e.target.value }));
					}}
					placeholder="URL directa, SoundCloud o archivo MP3 abajo"
				/>
				<label className="backoffice-file">
					<span>{file ? file.name : "Subir MP3"}</span>
					<input
						type="file"
						accept="audio/mpeg,audio/mp3,.mp3"
						onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
					/>
				</label>
				<label className="backoffice-check">
					<input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
					Activo
				</label>
				<div className="backoffice-actions">
					<button className="btn-arena" onClick={submit} disabled={!key || uploading || !form.name.trim() || (!form.audioUrl.trim() && !file)}>
						<span>{uploading ? "Subiendo" : form.id ? "Actualizar" : "Agregar"}</span>
					</button>
					{form.id && (
						<button className="btn-ghost" onClick={() => {
							setForm(EMPTY);
							setFile(null);
						}}>
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
