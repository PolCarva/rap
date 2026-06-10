import { getCurrentUser, getServerDb } from "@/lib/server-auth";
import { updateUserHandle } from "@rap/db";
import { z } from "zod";

const bodySchema = z.object({
	handle: z.string().min(2).max(30),
});

export async function PATCH(req: Request): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

	const db = getServerDb();
	if (!db) return Response.json({ error: "Base de datos no disponible" }, { status: 503 });

	const parsed = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return Response.json({ error: "AKA inválido" }, { status: 400 });

	const result = await updateUserHandle(db, user.id, parsed.data.handle);
	if ("error" in result) return Response.json({ error: result.error }, { status: 409 });

	return Response.json({ id: user.id, handle: result.handle, email: user.email });
}
