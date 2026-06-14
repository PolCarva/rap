import { AppNav } from "@/components/AppNav";
import { PracticeApp } from "@/components/practice/PracticeApp";
import { absoluteUrl, breadcrumbJsonLd, createPageMetadata, jsonLd, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { MODALITY_IDS, type ModalityId } from "@rap/shared";

type PracticeSearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = createPageMetadata({
	title: "Práctica de freestyle offline",
	description:
		"Entrená freestyle sin rival: solo a pantalla completa con palabras, tiempo y transcripción, o de a dos en un mismo dispositivo con juez IA.",
	path: "/practica",
	image: "/og-arena.png",
	keywords: ["practicar freestyle", "freestyle solo", "entrenar rap", "freestyle un dispositivo"],
});

function parseInitialModality(value: string | string[] | undefined): ModalityId | undefined {
	const raw = Array.isArray(value) ? value[0] : value;
	return MODALITY_IDS.includes(raw as ModalityId) ? (raw as ModalityId) : undefined;
}

export default async function PracticePage({ searchParams }: { searchParams: PracticeSearchParams }) {
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
							"@id": absoluteUrl("/practica#webpage"),
							url: absoluteUrl("/practica"),
							name: "Práctica de freestyle offline",
							description: SITE_DESCRIPTION,
							isPartOf: { "@id": absoluteUrl("/#website") },
							mainEntity: { "@id": absoluteUrl("/#app") },
							publisher: { "@id": absoluteUrl("/#organization") },
						},
						breadcrumbJsonLd([
							{ name: SITE_NAME, path: "/" },
							{ name: "Práctica", path: "/practica" },
						]),
					]),
				}}
			/>
			<div className="arena-grain" />
			<div className="arena-vignette" />
			<AppNav status="MODO PRÁCTICA" />
			<PracticeApp initialModality={initialModality} />
		</main>
	);
}
