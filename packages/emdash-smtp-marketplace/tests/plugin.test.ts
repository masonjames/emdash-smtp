import { describe, expect, it } from "vitest";

import { emdashSmtpMarketplace, SMTP_MARKETPLACE_PLUGIN_ID } from "../src/index.js";
import plugin from "../src/sandbox-entry.js";

describe("emdash-smtp-marketplace descriptor", () => {
	it("is a standard plugin descriptor for the EmDash SMTP marketplace distribution", () => {
		const descriptor = emdashSmtpMarketplace();
		expect(descriptor.id).toBe("emdash-smtp");
		expect(descriptor.id).toBe(SMTP_MARKETPLACE_PLUGIN_ID);
		expect(descriptor.format).toBe("standard");
		expect(descriptor.entrypoint).toBe("emdash-smtp-marketplace/sandbox");
		expect(descriptor.allowedHosts).toEqual(
			expect.arrayContaining([
				"api.resend.com",
				"gmail.googleapis.com",
				"oauth2.googleapis.com",
				"graph.microsoft.com",
				"login.microsoftonline.com",
				"accounts.zoho.com",
			]),
		);
	});
});

describe("emdash-smtp-marketplace runtime", () => {
	it("exposes an admin route and email delivery hook", () => {
		expect(plugin.routes).toHaveProperty("admin");
		expect(plugin.hooks).toHaveProperty("email:deliver");
		expect(plugin.hooks).toHaveProperty("email:status");
	});
});
