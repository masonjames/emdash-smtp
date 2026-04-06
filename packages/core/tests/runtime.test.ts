import { describe, expect, it, vi } from "vitest";

import {
	collectAllowedHosts,
	SMTP_PROVIDER_DEFINITIONS,
	createDeliveryLogRecord,
	deliverWithConfiguredProvider,
	handleAdminInteraction,
	isDeliveryReady,
	writeDeliveryLog,
} from "../src/index.js";
import type { DeliveryLogRecord, SmtpPluginContextLike } from "../src/index.js";

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function decodeBase64Url(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	return Buffer.from(padded, "base64").toString("utf8");
}

function createMockCtx(seed: Record<string, unknown> = {}) {
	const kvStore = new Map<string, unknown>(Object.entries(seed));
	const logs = new Map<string, DeliveryLogRecord>();

	const ctx: SmtpPluginContextLike = {
		plugin: { id: "emdash-smtp", version: "0.2.1" },
		kv: {
			get: async <T>(key: string): Promise<T | null> => ((kvStore.get(key) as T | undefined) ?? null),
			set: async (key: string, value: unknown) => {
				kvStore.set(key, value);
			},
			delete: async (key: string) => kvStore.delete(key),
			list: async (prefix = "") =>
				[...kvStore.entries()]
					.filter(([key]) => key.startsWith(prefix))
					.map(([key, value]) => ({ key, value })),
		},
		storage: {
			deliveryLogs: {
				put: async (id: string, data: DeliveryLogRecord) => {
					logs.set(id, data);
				},
				query: async () => ({
					items: [...logs.entries()].map(([id, data]) => ({ id, data })),
					hasMore: false,
				}),
				count: async (where?: Record<string, unknown>) => {
					if (!where?.status) return logs.size;
					return [...logs.values()].filter((entry) => entry.status === where.status).length;
				},
			},
		},
		log: {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	};

	return { ctx, kvStore, logs };
}

describe("provider catalog", () => {
	it("exposes the full EmDash SMTP provider catalog", () => {
		expect(SMTP_PROVIDER_DEFINITIONS).toHaveLength(18);
		expect(SMTP_PROVIDER_DEFINITIONS.map((provider) => provider.id)).toEqual([
			"amazon",
			"brevo",
			"elastic_email",
			"emailit",
			"generic",
			"google",
			"mailchimp",
			"mailersend",
			"mailgun",
			"mailjet",
			"microsoft",
			"phpmail",
			"postmark",
			"resend",
			"sendgrid",
			"smtp2go",
			"sparkpost",
			"zoho",
		]);
	});

	it("includes OAuth token hosts in the marketplace allowlist", () => {
		expect(collectAllowedHosts("marketplace")).toEqual(
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

describe("delivery engine", () => {
	it("reports delivery readiness only when a provider and default from address are configured", async () => {
		const readyCtx = createMockCtx({
			"settings:global": {
				primaryProviderId: "resend",
				fromEmail: "noreply@example.com",
				fromName: "Example",
				logLevel: "all",
			},
			"settings:provider:resend": { apiKey: "resend-key" },
		});
		const notReadyCtx = createMockCtx({
			"settings:global": {
				primaryProviderId: "resend",
				logLevel: "all",
			},
			"settings:provider:resend": { apiKey: "resend-key" },
		});

		await expect(
			isDeliveryReady({
				ctx: readyCtx.ctx,
				runtime: { variant: "marketplace", fetch: vi.fn() },
			}),
		).resolves.toBe(true);
		await expect(
			isDeliveryReady({
				ctx: notReadyCtx.ctx,
				runtime: { variant: "marketplace", fetch: vi.fn() },
			}),
		).resolves.toBe(false);
	});

	it("uses the fallback provider immediately when the selected primary is trusted-only in marketplace mode", async () => {
		const { ctx } = createMockCtx({
			"settings:global": {
				primaryProviderId: "generic",
				fallbackProviderId: "resend",
				fromEmail: "noreply@example.com",
				fromName: "Example",
				logLevel: "all",
			},
			"settings:provider:generic": {
				host: "smtp.example.com",
				port: 587,
				security: "starttls",
			},
			"settings:provider:resend": { apiKey: "resend-key" },
		});

		const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ id: "re_marketplace_123" }, 200));

		const result = await deliverWithConfiguredProvider({
			ctx,
			runtime: { variant: "marketplace", fetch },
			message: { to: "user@example.com", subject: "Hello", text: "Body" },
			source: "test-suite",
		});

		expect(result.providerId).toBe("resend");
		expect(result.remoteMessageId).toBe("re_marketplace_123");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("falls back to a secondary configured provider when the primary fails", async () => {
		const { ctx } = createMockCtx({
			"settings:global": {
				primaryProviderId: "brevo",
				fallbackProviderId: "resend",
				fromEmail: "noreply@example.com",
				fromName: "Example",
				logLevel: "all",
			},
			"settings:provider:brevo": { apiKey: "brevo-key" },
			"settings:provider:resend": { apiKey: "resend-key" },
		});

		const fetch = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ message: "brevo failed" }, 401))
			.mockResolvedValueOnce(jsonResponse({ id: "re_test_123" }, 200));

		const result = await deliverWithConfiguredProvider({
			ctx,
			runtime: { variant: "marketplace", fetch },
			message: { to: "user@example.com", subject: "Hello", text: "Body" },
			source: "test-suite",
		});

		expect(result.providerId).toBe("resend");
		expect(result.remoteMessageId).toBe("re_test_123");
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("refreshes a Google access token and retries when the stored token is rejected", async () => {
		const { ctx, kvStore } = createMockCtx({
			"settings:global": {
				primaryProviderId: "google",
				fromEmail: "noreply@example.com",
				fromName: "Example",
				logLevel: "all",
			},
			"settings:provider:google": {
				accessToken: "expired-google-token",
				refreshToken: "google-refresh-token",
				clientId: "google-client-id",
				clientSecret: "google-client-secret",
			},
		});

		const fetch = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ error: { message: "invalid credentials" } }, 401))
			.mockResolvedValueOnce(jsonResponse({ access_token: "fresh-google-token" }, 200))
			.mockResolvedValueOnce(jsonResponse({ id: "gmail-message-123" }, 200));

		const result = await deliverWithConfiguredProvider({
			ctx,
			runtime: { variant: "marketplace", fetch },
			message: { to: "user@example.com", subject: "Hello", text: "Body" },
			source: "test-suite",
		});

		expect(result.providerId).toBe("google");
		expect(result.remoteMessageId).toBe("gmail-message-123");
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			"https://oauth2.googleapis.com/token",
			expect.objectContaining({ method: "POST" }),
		);
		expect((kvStore.get("settings:provider:google") as Record<string, unknown>).accessToken).toBe(
			"fresh-google-token",
		);
	});

	it("builds a safe raw MIME message for Gmail delivery", async () => {
		const { ctx } = createMockCtx({
			"settings:global": {
				primaryProviderId: "google",
				fromEmail: "noreply@example.com",
				fromName: "Café Team",
				replyTo: "reply@example.com",
				logLevel: "all",
			},
			"settings:provider:google": {
				accessToken: "good-google-token",
			},
		});

		const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ id: "gmail-message-raw-123" }, 200));

		await deliverWithConfiguredProvider({
			ctx,
			runtime: { variant: "marketplace", fetch },
			message: {
				to: "user@example.com",
				subject: "Hello\r\nBcc:evil@example.com ✓",
				text: "Plain body",
			},
			source: "test-suite",
		});

		const [, init] = fetch.mock.calls[0] as [string, RequestInit];
		const requestBody = JSON.parse(String(init.body)) as { raw: string };
		const rawMessage = decodeBase64Url(requestBody.raw);
		expect(rawMessage).toContain("From: =?UTF-8?B?");
		expect(rawMessage).toContain("Subject: =?UTF-8?B?");
		expect(rawMessage).toContain('Content-Type: text/plain; charset="UTF-8"\r\n\r\nPlain body');
		expect(rawMessage).not.toContain("\r\nBcc:evil@example.com");
	});

	it("can send with Microsoft refresh-token credentials when no access token is stored", async () => {
		const { ctx, kvStore } = createMockCtx({
			"settings:global": {
				primaryProviderId: "microsoft",
				fromEmail: "noreply@example.com",
				fromName: "Example",
				logLevel: "all",
			},
			"settings:provider:microsoft": {
				refreshToken: "ms-refresh-token",
				clientId: "ms-client-id",
				clientSecret: "ms-client-secret",
				tenantId: "common",
			},
		});

		const fetch = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ access_token: "fresh-ms-token", refresh_token: "fresh-ms-refresh" }, 200))
			.mockResolvedValueOnce(new Response(null, { status: 202 }));

		const result = await deliverWithConfiguredProvider({
			ctx,
			runtime: { variant: "marketplace", fetch },
			message: { to: "user@example.com", subject: "Hello", text: "Body" },
			source: "test-suite",
		});

		expect(result.providerId).toBe("microsoft");
		expect(fetch).toHaveBeenNthCalledWith(
			1,
			"https://login.microsoftonline.com/common/oauth2/v2.0/token",
			expect.objectContaining({ method: "POST" }),
		);
		expect((kvStore.get("settings:provider:microsoft") as Record<string, unknown>).accessToken).toBe(
			"fresh-ms-token",
		);
	});

	it("can send with Zoho refresh-token credentials and the selected datacenter host", async () => {
		const { ctx, kvStore } = createMockCtx({
			"settings:global": {
				primaryProviderId: "zoho",
				fromEmail: "noreply@example.com",
				fromName: "Example",
				logLevel: "all",
			},
			"settings:provider:zoho": {
				dataCenterRegion: "eu",
				accountId: "zoho-account-123",
				refreshToken: "zoho-refresh-token",
				clientId: "zoho-client-id",
				clientSecret: "zoho-client-secret",
			},
		});

		const fetch = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ access_token: "fresh-zoho-token" }, 200))
			.mockResolvedValueOnce(jsonResponse({ data: { messageId: "zoho-message-123" } }, 200));

		const result = await deliverWithConfiguredProvider({
			ctx,
			runtime: { variant: "marketplace", fetch },
			message: { to: "user@example.com", subject: "Hello", text: "Body" },
			source: "test-suite",
		});

		expect(result.providerId).toBe("zoho");
		expect(result.remoteMessageId).toBe("zoho-message-123");
		expect(fetch).toHaveBeenNthCalledWith(
			1,
			"https://accounts.zoho.com/oauth/v2/token",
			expect.objectContaining({ method: "POST" }),
		);
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			"https://mail.zoho.eu/api/accounts/zoho-account-123/messages",
			expect.objectContaining({ method: "POST" }),
		);
		expect((kvStore.get("settings:provider:zoho") as Record<string, unknown>).accessToken).toBe(
			"fresh-zoho-token",
		);
	});

	it("builds the expected Resend payload for HTML email delivery", async () => {
		const { ctx } = createMockCtx({
			"settings:global": {
				primaryProviderId: "resend",
				fromEmail: "noreply@example.com",
				fromName: "Example Sender",
				replyTo: "reply@example.com",
				logLevel: "all",
			},
			"settings:provider:resend": { apiKey: "resend-key" },
		});

		const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ id: "re_html_123" }, 200));

		const result = await deliverWithConfiguredProvider({
			ctx,
			runtime: { variant: "marketplace", fetch },
			message: {
				to: ["user@example.com"],
				subject: "Hello HTML",
				text: "Plain body",
				html: "<p>HTML body</p>",
			},
			source: "test-suite",
		});

		expect(result.providerId).toBe("resend");
		expect(result.remoteMessageId).toBe("re_html_123");
		expect(fetch).toHaveBeenCalledWith(
			"https://api.resend.com/emails",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ Authorization: "Bearer resend-key" }),
				body: JSON.stringify({
					to: ["user@example.com"],
					from: "Example Sender <noreply@example.com>",
					subject: "Hello HTML",
					html: "<p>HTML body</p>",
					text: "Plain body",
					reply_to: "reply@example.com",
				}),
			}),
		);
	});
});

describe("delivery logs", () => {
	it("respects the errors-only log level", async () => {
		const { ctx, logs } = createMockCtx({
			"settings:global": { logLevel: "errors" },
		});

		await writeDeliveryLog(
			ctx,
			createDeliveryLogRecord({
				providerId: "resend",
				status: "sent",
				source: "test",
				durationMs: 5,
				message: { to: "user@example.com", subject: "Sent" },
			}),
		);
		await writeDeliveryLog(
			ctx,
			createDeliveryLogRecord({
				providerId: "resend",
				status: "failed",
				source: "test",
				durationMs: 5,
				message: { to: "user@example.com", subject: "Failed" },
				errorMessage: "boom",
			}),
		);

		expect(logs.size).toBe(1);
		expect([...logs.values()][0]?.status).toBe("failed");
	});
});

describe("admin interaction", () => {
	it("renders the logs page from a block action", async () => {
		const { ctx } = createMockCtx({
			"settings:global": { fromEmail: "noreply@example.com", logLevel: "all" },
		});

		const response = await handleAdminInteraction({
			ctx,
			variant: "marketplace",
			runtime: { variant: "marketplace", fetch: vi.fn() },
			interaction: { type: "block_action", action_id: "go_logs" },
		});

		expect(response.blocks[0]).toMatchObject({ type: "header", text: "SMTP Logs" });
	});
});
