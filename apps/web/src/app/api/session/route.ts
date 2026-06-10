import { persistSession } from "@/lib/data";
import { z } from "zod";

const bodySchema = z.object({
	sessionId: z.string().min(1).max(80),
	userId: z.string().min(1).max(80).nullable(),
	name: z.string().min(1).max(40),
	isGuest: z.boolean(),
});

export async function POST(req: Request): Promise<Response> {
	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return Response.json({ error: "Body inválido" }, { status: 400 });
	const session = await persistSession(parsed.data);
	return Response.json({ session });
}
