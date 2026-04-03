import {
	getAvailableProviderSelectOptions,
	getProviderById,
	isProviderAvailable,
	isProviderConfigured,
	SMTP_PROVIDER_DEFINITIONS,
} from "./providers.js";
import { getGlobalSettings, getProviderSettings } from "./storage.js";
import type {
	DeliveryMessage,
	DeliveryResult,
	DeliveryRuntime,
	GlobalSettings,
	ProviderDefinition,
	SmtpPluginContextLike,
} from "./types.js";

function trimmed(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const next = value.trim();
	return next === "" ? undefined : next;
}

function stripHtml(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeMessageInput(
	message: {
		to: string | string[];
		subject: string;
		text: string;
		html?: string;
	},
	settings: GlobalSettings,
): DeliveryMessage {
	const to = (Array.isArray(message.to) ? message.to : String(message.to).split(","))
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (to.length === 0) {
		throw new Error("At least one recipient email address is required.");
	}
	const fromEmail = trimmed(settings.fromEmail);
	if (!fromEmail) {
		throw new Error("A default from email must be configured before sending.");
	}
	const text = trimmed(message.text) ?? (message.html ? stripHtml(message.html) : "");
	if (!text && !trimmed(message.html)) {
		throw new Error("A message body is required.");
	}
	return {
		to,
		subject: message.subject,
		text,
		html: trimmed(message.html),
		fromEmail,
		fromName: trimmed(settings.fromName),
		replyTo: trimmed(settings.replyTo) ? [settings.replyTo!.trim()] : undefined,
	};
}

async function resolvePrimaryProvider(
	ctx: SmtpPluginContextLike,
	runtime: DeliveryRuntime,
	settings: GlobalSettings,
): Promise<{ provider: ProviderDefinition; providerSettings: Record<string, unknown> }> {
	const preferred = settings.primaryProviderId ? getProviderById(settings.primaryProviderId) : undefined;
	if (preferred && isProviderAvailable(preferred, runtime.variant)) {
		const providerSettings = await getProviderSettings(ctx, preferred.id);
		if (isProviderConfigured(preferred, providerSettings)) {
			return { provider: preferred, providerSettings };
		}
	}

	for (const provider of SMTP_PROVIDER_DEFINITIONS) {
		if (!isProviderAvailable(provider, runtime.variant)) continue;
		const providerSettings = await getProviderSettings(ctx, provider.id);
		if (isProviderConfigured(provider, providerSettings)) {
			return { provider, providerSettings };
		}
	}

	const variantLabel = runtime.variant === "marketplace" ? "marketplace-compatible" : "trusted";
	throw new Error(`No configured ${variantLabel} SMTP provider is available.`);
}

async function resolveFallbackProvider(
	ctx: SmtpPluginContextLike,
	runtime: DeliveryRuntime,
	settings: GlobalSettings,
	primaryProviderId: string,
): Promise<{ provider: ProviderDefinition; providerSettings: Record<string, unknown> } | undefined> {
	if (!settings.fallbackProviderId || settings.fallbackProviderId === primaryProviderId) return undefined;
	const provider = getProviderById(settings.fallbackProviderId);
	if (!provider || !isProviderAvailable(provider, runtime.variant)) return undefined;
	const providerSettings = await getProviderSettings(ctx, provider.id);
	if (!isProviderConfigured(provider, providerSettings)) return undefined;
	return { provider, providerSettings };
}

async function sendWithProvider(
	ctx: SmtpPluginContextLike,
	provider: ProviderDefinition,
	providerSettings: Record<string, unknown>,
	message: DeliveryMessage,
	runtime: DeliveryRuntime,
): Promise<DeliveryResult> {
	const start = Date.now();
	const result = await provider.send({
		ctx,
		providerId: provider.id,
		settings: providerSettings,
		message,
		runtime,
	});
	return {
		providerId: provider.id,
		remoteMessageId: result.remoteMessageId,
		durationMs: Date.now() - start,
	};
}

export async function deliverWithConfiguredProvider(args: {
	ctx: SmtpPluginContextLike;
	runtime: DeliveryRuntime;
	message: {
		to: string | string[];
		subject: string;
		text: string;
		html?: string;
	};
	source: string;
}): Promise<DeliveryResult> {
	const settings = await getGlobalSettings(args.ctx);
	const normalizedMessage = normalizeMessageInput(args.message, settings);
	const primary = await resolvePrimaryProvider(args.ctx, args.runtime, settings);
	const fallback = await resolveFallbackProvider(args.ctx, args.runtime, settings, primary.provider.id);

	try {
		return await sendWithProvider(args.ctx, primary.provider, primary.providerSettings, normalizedMessage, args.runtime);
	} catch (primaryError) {
		if (!fallback) {
			throw primaryError;
		}
		args.ctx.log?.warn("Primary SMTP provider failed, attempting fallback provider.", {
			primaryProviderId: primary.provider.id,
			fallbackProviderId: fallback.provider.id,
			error: primaryError instanceof Error ? primaryError.message : String(primaryError),
		});
		return sendWithProvider(args.ctx, fallback.provider, fallback.providerSettings, normalizedMessage, args.runtime);
	}
}
