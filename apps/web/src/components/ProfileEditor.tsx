"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRapSession } from "@/components/battle/useRapSession";

export function ProfileEditor({ handle }: { handle: string }) {
	const session = useRapSession();
	const router = useRouter();
	const [value, setValue] = useState(handle.toUpperCase());
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		setValue(handle.toUpperCase());
	}, [handle]);

	const dirty = value.trim().toLowerCase() !== handle.toLowerCase();
	const save = async () => {
		const ok = await session.updateHandle(value.trim());
		setSaved(ok);
		if (ok) router.refresh();
	};

	return (
		<section className="profile-editor">
			<div>
				<p className="profile-editor-kicker">Perfil</p>
				<label htmlFor="profile-aka">AKA</label>
			</div>
			<input
				id="profile-aka"
				value={value}
				onChange={(e) => {
					setSaved(false);
					setValue(e.target.value.toUpperCase());
				}}
				maxLength={30}
				autoComplete="username"
			/>
			<button className="btn-arena profile-editor-save" disabled={!dirty || session.authState === "loading"} onClick={save}>
				<span>{session.authState === "loading" ? "Guardando" : "Guardar"}</span>
			</button>
			{session.authError && <p className="profile-editor-error">{session.authError}</p>}
			{saved && <p className="profile-editor-ok">AKA actualizado</p>}
		</section>
	);
}
