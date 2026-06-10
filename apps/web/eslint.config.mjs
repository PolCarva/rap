import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
	{
		ignores: [".next/**", ".open-next/**", ".wrangler/**", "public/**", "next-env.d.ts"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		plugins: {
			"@next/next": nextPlugin,
			"react-hooks": reactHooks,
		},
		rules: {
			...nextPlugin.configs.recommended.rules,
			...nextPlugin.configs["core-web-vitals"].rules,
			...reactHooks.configs.recommended.rules,
			"no-console": "off",
			"react-hooks/set-state-in-effect": "off",
		},
	},
];
