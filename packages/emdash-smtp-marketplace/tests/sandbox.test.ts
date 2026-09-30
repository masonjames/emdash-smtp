import { afterEach, expect, it } from "vitest";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

let host: PluginRuntimeTestHost | undefined;
afterEach(async () => { await host?.dispose(); host = undefined; });

it("saves provider secrets privately, delivers through the sandbox HTTP bridge, and persists logs", async () => {
	host = await createPluginRuntimeTestHost();
	const user = await host.fixtures.user({ email: "admin@example.test", role: "admin" });
	await host.admin.loadPage("/providers", { user });
	await host.admin.act("/providers", "select_provider", { user, value: "resend" });
	const saved = await host.admin.submit("/providers", "save_provider", { apiKey: "test-only-provider-key" }, { user });
	expect(JSON.stringify(saved)).not.toContain("test-only-provider-key");
	await host.admin.submit("/providers", "save_global", { fromEmail: "sender@example.test", primaryProviderId: "resend" }, { user });
	await host.http.respond("https://api.resend.com/emails", Response.json({ id: "local-test-message" }));
	await host.transport.invokeHook("email:deliver", { message: { to: "reader@example.test", subject: "Form notification", text: "Local test only" }, source: "forms" });
	expect(host.http.requests()).toEqual([expect.objectContaining({ url: "https://api.resend.com/emails", method: "POST" })]);
	await host.restart();
	expect(await host.inspect.storage.list("delivery_logs")).toEqual([expect.objectContaining({ data: expect.objectContaining({ status: "sent", providerId: "resend", source: "forms", remoteMessageId: "local-test-message" }) })]);
	await host.admin.loadPage("/logs", { user });
	await host.admin.loadWidget("smtp-overview", { user });
	expect((await host.actions.routes.request("admin", { method: "POST", body: { type: "page_load", page: "/providers" } })).status).toBe(401);
	expect(await host.transport.invokeRoute("admin", { type: "form_submit", action_id: "save_global", values: null })).toMatchObject({ toast: { type: "error" } });
	expect(await host.inspect.setting("global")).toMatchObject({ fromEmail: "sender@example.test", primaryProviderId: "resend" });
});
