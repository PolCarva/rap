import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Paquetes del monorepo escritos en TypeScript que Next debe transpilar.
	transpilePackages: ["@rap/shared", "@rap/db"],
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
