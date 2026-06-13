import { AppNav } from "@/components/AppNav";
import { BattleApp } from "@/components/battle/BattleApp";
import { absoluteUrl, breadcrumbJsonLd, createPageMetadata, jsonLd, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { MODALITY_IDS, type ModalityId } from "@rap/shared";

type ArenaSearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = createPageMetadata({
	title: "Arena de freestyle online",
	description:
		"Entrá a la arena de Rapear Online, elegí modo y beat, buscá rival y batallá freestyle 1 vs 1 en vivo con juez IA.",
	path: "/arena",
	image: "/og-arena.png",
	keywords: ["arena freestyle", "batalla 1 vs 1", "freestyle con beat", "rap online en vivo"],
});

function parseInitialModality(value: string | string[] | undefined): ModalityId | undefined {
	const raw = Array.isArray(value) ? value[0] : value;
	return MODALITY_IDS.includes(raw as ModalityId) ? (raw as ModalityId) : undefined;
}

export default async function ArenaPage({ searchParams }: { searchParams: ArenaSearchParams }) {
	const params = await searchParams;
	const initialModality = parseInitialModality(params.modo);

	return (
		<main style={{ minHeight: "100vh", background: "var(--ink)", overflowY: "auto" }}>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: jsonLd([
						{
							"@context": "https://schema.org",
							"@type": "WebPage",
							"@id": absoluteUrl("/arena#webpage"),
							url: absoluteUrl("/arena"),
							name: "Arena de freestyle online",
							description: SITE_DESCRIPTION,
							isPartOf: { "@id": absoluteUrl("/#website") },
							mainEntity: { "@id": absoluteUrl("/#app") },
							publisher: { "@id": absoluteUrl("/#organization") },
						},
						breadcrumbJsonLd([
							{ name: SITE_NAME, path: "/" },
							{ name: "Arena", path: "/arena" },
						]),
					]),
				}}
			/>
			<div className="arena-grain" />
			<div className="arena-vignette" />
			<AppNav status="SALA DE PREPARACION" />
			<BattleApp initialModality={initialModality} />
		</main>
	);
}
