import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Paquetes del monorepo escritos en TypeScript que Next debe transpilar.
	transpilePackages: ["@rap/shared", "@rap/db"],
	env: {
		NEXT_PUBLIC_REALTIME_URL:
			process.env.NEXT_PUBLIC_REALTIME_URL ??
			(process.env.NODE_ENV === "production" ? "wss://rap-realtime.raparena.workers.dev" : ""),
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
// persist.path apunta al MISMO estado local que usa apps/realtime (wrangler dev
// --persist-to), así web y realtime comparten la misma D1 en desarrollo.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import path from "node:path";
initOpenNextCloudflareForDev({
	persist: { path: path.resolve(process.cwd(), "../../.wrangler-shared/state/v3") },
});
