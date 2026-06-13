import type { MetadataRoute } from "next";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: ["/api/", "/backoffice", "/perfil/me"],
			},
			{
				userAgent: "Googlebot",
				allow: "/",
				disallow: ["/api/", "/backoffice", "/perfil/me"],
			},
		],
		sitemap: absoluteUrl("/sitemap.xml"),
		host: SITE_URL,
	};
}
