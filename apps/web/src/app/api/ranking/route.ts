import { getRanking } from "@/lib/data";

// Datos en vivo: el ranking cambia con cada batalla rankeada.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	const ranking = await getRanking(50);
	return Response.json({ ranking });
}
