import { getRanking } from "@/lib/data";

export async function GET(): Promise<Response> {
	const ranking = await getRanking(50);
	return Response.json({ ranking });
}
