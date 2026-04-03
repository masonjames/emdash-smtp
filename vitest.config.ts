import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
	},
	resolve: {
		alias: {
			emdash: resolve(__dirname, "../emdash/packages/core"),
			"@masonjames/emdash-smtp-core": resolve(__dirname, "packages/core/src/index.ts"),
			"@masonjames/emdash-smtp-node-transports": resolve(
				__dirname,
				"packages/node-transports/src/index.ts",
			),
		},
	},
});
