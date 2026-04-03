import { describe, expect, it } from "vitest";

import { emdashSmtp } from "../src/index.js";
import { createPlugin } from "../src/plugin.js";

describe("@masonjames/emdash-smtp descriptor", () => {
	it("uses the shared emdash-smtp plugin id", () => {
		const descriptor = emdashSmtp();
		expect(descriptor.id).toBe("emdash-smtp");
		expect(descriptor.entrypoint).toBe("@masonjames/emdash-smtp/plugin");
		expect(descriptor.adminPages).toHaveLength(2);
	});
});

describe("@masonjames/emdash-smtp plugin", () => {
	it("registers email delivery and admin routes", () => {
		const plugin = createPlugin();
		expect(plugin.hooks).toHaveProperty("email:deliver");
		expect(plugin.routes).toHaveProperty("admin");
		expect(plugin.admin?.pages).toHaveLength(2);
	});
});
