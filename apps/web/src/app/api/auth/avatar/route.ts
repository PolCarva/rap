import { getCurrentUser, getServerDb } from "@/lib/server-auth";
import { updateUserAvatar } from "@rap/db";
import { avatarConfigSchema } from "@rap/shared";

export async function PATCH(req: Request): Promise<Response> {
	const user = await getCurrentUser();
	if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

	const db = getServerDb();
	if (!db) return Response.json({ error: "Base de datos no disponible" }, { status: 503 });

	const parsed = avatarConfigSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return Response.json({ error: "Avatar inválido" }, { status: 400 });

	const json = JSON.stringify(parsed.data);
	const result = await updateUserAvatar(db, user.id, json);
	if ("error" in result) return Response.json({ error: result.error }, { status: 500 });

	return Response.json({ avatarConfig: parsed.data });
}
