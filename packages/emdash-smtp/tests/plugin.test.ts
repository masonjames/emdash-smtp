import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { emdashSmtp } from "../src/index.js";
import { createPlugin } from "../src/plugin.js";

describe("emdash-smtp descriptor", () => {
	it("uses the shared emdash-smtp plugin id", () => {
		const descriptor = emdashSmtp();
		expect(descriptor.id).toBe("emdash-smtp");
		expect(descriptor.format).toBe("native");
		expect(descriptor.entrypoint).toBe("emdash-smtp/plugin");
		expect(descriptor.capabilities).toEqual(["email:provide", "network:fetch"]);
		expect(descriptor.allowedHosts?.length).toBeGreaterThan(0);
		expect(descriptor.adminPages).toHaveLength(2);
	});
});

describe("emdash-smtp package metadata", () => {
	it("keeps package plugin.id metadata in sync", () => {
		const descriptor = emdashSmtp();
		const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
			plugin?: { id?: string };
		};
		const workspacePkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
			plugin?: { id?: string };
		};
		expect(pkg.plugin?.id).toBe(descriptor.id);
		expect(workspacePkg.plugin?.id).toBe(descriptor.id);
	});
});

describe("emdash-smtp plugin", () => {
	it("registers email delivery and admin routes", () => {
		const plugin = createPlugin();
		expect(plugin.hooks).toHaveProperty("email:deliver");
		expect(plugin.hooks).not.toHaveProperty("email:status");
		expect(plugin.routes).toHaveProperty("admin");
		expect(plugin.admin?.pages).toHaveLength(2);
	});
});
