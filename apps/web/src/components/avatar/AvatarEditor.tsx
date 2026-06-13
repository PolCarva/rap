"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
	ACCESSORIES,
	AVATAR_STYLES,
	BACKGROUNDS,
	DEFAULT_AVATAR,
	FACE_SHAPES,
	FACE_TYPES,
	FACIAL_HAIR,
	GLASSES,
	HATS,
	NECKLACES,
	SKIN_TONES,
	avatarFromSeed,
	type AvatarConfig,
	type AvatarOption,
} from "@rap/shared";
import { useRapSession } from "@/components/battle/useRapSession";
import { RapperAvatar } from "./RapperAvatar";

type Category = {
	key: keyof AvatarConfig;
	label: string;
	options: AvatarOption[];
};

const CATEGORIES: Category[] = [
	{ key: "gender", label: "Silueta", options: AVATAR_STYLES },
	{ key: "face", label: "Cara", options: FACE_TYPES },
	{ key: "faceShape", label: "Forma", options: FACE_SHAPES },
	{ key: "skin", label: "Piel", options: SKIN_TONES },
	{ key: "hat", label: "Cabeza", options: HATS },
	{ key: "glasses", label: "Lentes", options: GLASSES },
	{ key: "facialHair", label: "Barba", options: FACIAL_HAIR },
	{ key: "necklace", label: "Collar", options: NECKLACES },
	{ key: "accessory", label: "Extra", options: ACCESSORIES },
	{ key: "background", label: "Fondo", options: BACKGROUNDS },
];

function sameConfig(a: AvatarConfig, b: AvatarConfig): boolean {
	return (Object.keys(a) as (keyof AvatarConfig)[]).every((k) => a[k] === b[k]);
}

export function AvatarEditor({ initial, seed }: { initial?: AvatarConfig | null; seed?: string }) {
	const session = useRapSession();
	const router = useRouter();
	const baseline = initial ?? (seed ? avatarFromSeed(seed) : DEFAULT_AVATAR);
	const [cfg, setCfg] = useState<AvatarConfig>(baseline);
	const [savedCfg, setSavedCfg] = useState<AvatarConfig>(baseline);
	const [activeCat, setActiveCat] = useState<keyof AvatarConfig>("gender");
	const [justSaved, setJustSaved] = useState(false);

	const category = CATEGORIES.find((c) => c.key === activeCat) ?? CATEGORIES[0];
	const dirty = useMemo(() => !sameConfig(cfg, savedCfg), [cfg, savedCfg]);
	const loading = session.authState === "loading";

	const setField = (key: keyof AvatarConfig, value: string) => {
		setJustSaved(false);
		setCfg((c) => ({ ...c, [key]: value }) as AvatarConfig);
	};

	const randomize = () => {
		setJustSaved(false);
		setCfg(avatarFromSeed(`${Date.now()}-${Math.random()}`));
	};

	const save = async () => {
		const ok = await session.updateAvatar(cfg);
		if (ok) {
			setSavedCfg(cfg);
			setJustSaved(true);
			router.refresh();
		}
	};

	return (
		<section className="avatar-editor">
			<div className="avatar-editor-head">
				<p className="profile-editor-kicker">Avatar</p>
				<button type="button" className="avatar-editor-random" onClick={randomize}>
					🎲 Aleatorio
				</button>
			</div>

			<div className="avatar-editor-body">
				{/* Preview */}
				<div className="avatar-editor-preview">
					<RapperAvatar config={cfg} size={172} />
					<p className="avatar-editor-name">{session.session.name || "TU MC"}</p>
				</div>

				{/* Controles */}
				<div className="avatar-editor-controls">
					<div className="avatar-cat-tabs" role="tablist">
						{CATEGORIES.map((c) => (
							<button
								key={c.key}
								role="tab"
								aria-selected={c.key === activeCat}
								className={c.key === activeCat ? "active" : ""}
								onClick={() => setActiveCat(c.key)}
							>
								{c.label}
							</button>
						))}
					</div>

					<div className="avatar-option-grid">
						{category.options.map((opt) => {
							const previewCfg = { ...cfg, [category.key]: opt.id } as AvatarConfig;
							const selected = cfg[category.key] === opt.id;
							return (
								<button
									key={opt.id}
									type="button"
									className={`avatar-option${selected ? " selected" : ""}`}
									aria-pressed={selected}
									onClick={() => setField(category.key, opt.id)}
								>
									<RapperAvatar config={previewCfg} size={56} ring={false} />
									<span>{opt.label}</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			<div className="avatar-editor-footer">
				{session.session.isGuest ? (
					<p className="avatar-editor-hint">Iniciá sesión para guardar tu avatar.</p>
				) : (
					<>
						<button className="btn-arena avatar-editor-save" disabled={!dirty || loading} onClick={save}>
							<span>{loading ? "Guardando" : "Guardar avatar"}</span>
						</button>
						{session.authError && <p className="profile-editor-error">{session.authError}</p>}
						{justSaved && !dirty && <p className="profile-editor-ok">Avatar guardado</p>}
					</>
				)}
			</div>
		</section>
	);
}
