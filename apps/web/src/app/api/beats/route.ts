import { getBeats } from "@/lib/data";

export async function GET(): Promise<Response> {
	const beats = await getBeats(false);
	return Response.json({ beats });
}
