import { clearCookieOptions } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(): Promise<Response> {
	const jar = await cookies();
	jar.set(clearCookieOptions());
	return Response.json({ ok: true });
}
