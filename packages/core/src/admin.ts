import {
	collectAllowedHosts,
	getAvailableProviderSelectOptions,
	getProviderById,
	getProviderLabel,
	getProviderPickerOptions,
	isProviderAvailable,
	isProviderConfigured,
	SMTP_PROVIDER_DEFINITIONS,
} from "./providers.js";
import {
	countDeliveryLogs,
	createDeliveryLogRecord,
	getGlobalSettings,
	getLastTestResult,
	getProviderSettings,
	getSelectedProviderId,
	queryRecentDeliveryLogs,
	saveGlobalSettingsFromValues,
	saveProviderSettingsFromValues,
	setLastTestResult,
	setSelectedProviderId,
	writeDeliveryLog,
	clearProviderSecret,
} from "./storage.js";
import { deliverWithConfiguredProvider } from "./delivery.js";
import type {
	ActionsBlock,
	AdminInteraction,
	Block,
	BlockElement,
	BlockResponse,
	ContextBlock,
	CountSummary,
	DeliveryRuntime,
	FormBlock,
	GlobalSettings,
	LastTestResult,
	PluginVariant,
	ProviderDefinition,
	ProviderFieldDefinition,
	SmtpPluginContextLike,
	TableBlock,
} from "./types.js";

export const SMTP_PLUGIN_ID = "emdash-smtp";
export const SMTP_PLUGIN_VERSION = "0.1.0";

export const SMTP_ADMIN_PAGES = [
	{ path: "/providers", label: "SMTP Providers", icon: "mail" },
	{ path: "/logs", label: "SMTP Logs", icon: "activity" },
] as const;

export const SMTP_ADMIN_WIDGETS = [{ id: "smtp-overview", title: "SMTP", size: "third" }] as const;

function header(text: string): Block {
	return { type: "header", text };
}

function divider(): Block {
	return { type: "divider" };
}

function context(text: string): ContextBlock {
	return { type: "context", text };
}

function banner(title: string, description: string, variant: "default" | "alert" | "error" = "default"): Block {
	return { type: "banner", title, description, variant };
}

function stats(summary: CountSummary): Block {
	return {
		type: "stats",
		items: [
			{ label: "Active provider", value: summary.activeProviderLabel },
			{ label: "Sent", value: summary.sentCount, trend: summary.sentCount > 0 ? "up" : "neutral" },
			{ label: "Failed", value: summary.failedCount, trend: summary.failedCount > 0 ? "down" : "neutral" },
		],
	};
}

function actions(elements: BlockElement[]): ActionsBlock {
	return { type: "actions", elements };
}

function button(
	actionId: string,
	label: string,
	opts?: {
		style?: "primary" | "danger" | "secondary";
		value?: unknown;
		confirm?: { title: string; text: string; confirm: string; deny: string; style?: "danger" };
	},
): BlockElement {
	return {
		type: "button",
		action_id: actionId,
		label,
		...(opts?.style ? { style: opts.style } : {}),
		...(opts?.value !== undefined ? { value: opts.value } : {}),
		...(opts?.confirm ? { confirm: opts.confirm } : {}),
	};
}

function textField(field: ProviderFieldDefinition, value?: string): FormBlock["fields"][number] {
	return {
		type: "text_input",
		action_id: field.key,
		label: field.label,
		...(field.placeholder ? { placeholder: field.placeholder } : {}),
		...(value !== undefined ? { initial_value: value } : {}),
		...(field.type === "textarea" || field.multiline ? { multiline: true } : {}),
	};
}

function secretField(field: ProviderFieldDefinition, hasValue: boolean): FormBlock["fields"][number] {
	return {
		type: "secret_input",
		action_id: field.key,
		label: field.label,
		...(field.placeholder ? { placeholder: field.placeholder } : {}),
		has_value: hasValue,
	};
}

function numberField(field: ProviderFieldDefinition, value?: number): FormBlock["fields"][number] {
	return {
		type: "number_input",
		action_id: field.key,
		label: field.label,
		...(value !== undefined ? { initial_value: value } : {}),
	};
}

function selectField(
	field: ProviderFieldDefinition,
	value?: string,
	overrideOptions?: Array<{ label: string; value: string }>,
): FormBlock["fields"][number] {
	return {
		type: "select",
		action_id: field.key,
		label: field.label,
		options: overrideOptions ?? field.options ?? [],
		...(value !== undefined ? { initial_value: value } : {}),
	};
}

function toggleField(field: ProviderFieldDefinition, value?: boolean): FormBlock["fields"][number] {
	return {
		type: "toggle",
		action_id: field.key,
		label: field.label,
		...(field.description ? { description: field.description } : {}),
		...(value !== undefined ? { initial_value: value } : {}),
	};
}

function stringValue(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const next = value.trim();
	return next === "" ? undefined : next;
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function booleanValue(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return value === "true" || value === "1" || value === "on";
	return Boolean(value);
}

async function buildSummary(ctx: SmtpPluginContextLike): Promise<CountSummary> {
	const settings = await getGlobalSettings(ctx);
	const sentCount = await countDeliveryLogs(ctx, "sent");
	const failedCount = await countDeliveryLogs(ctx, "failed");
	return {
		activeProviderLabel: getProviderLabel(settings.primaryProviderId),
		sentCount,
		failedCount,
	};
}

async function getCurrentProvider(
	ctx: SmtpPluginContextLike,
	variant: PluginVariant,
): Promise<ProviderDefinition> {
	const selected = await getSelectedProviderId(ctx);
	const preferred = selected ? getProviderById(selected) : undefined;
	if (preferred) return preferred;
	return (
		SMTP_PROVIDER_DEFINITIONS.find((provider) => isProviderAvailable(provider, variant)) ??
		SMTP_PROVIDER_DEFINITIONS[0]!
	);
}

function buildGlobalSettingsForm(settings: GlobalSettings, variant: PluginVariant): FormBlock {
	const availableOptions = getAvailableProviderSelectOptions(variant);
	const logLevelOptions = [
		{ label: "All deliveries", value: "all" },
		{ label: "Errors only", value: "errors" },
		{ label: "Disabled", value: "off" },
	];
	return {
		type: "form",
		block_id: "global-settings",
		fields: [
			selectField(
				{ key: "primaryProviderId", label: "Primary Provider", type: "select", options: availableOptions },
				settings.primaryProviderId,
				availableOptions,
			),
			selectField(
				{
					key: "fallbackProviderId",
					label: "Fallback Provider",
					type: "select",
					options: [{ label: "None", value: "" }, ...availableOptions],
				},
				settings.fallbackProviderId,
				[{ label: "None", value: "" }, ...availableOptions],
			),
			textField({ key: "fromEmail", label: "Default From Email", type: "text", required: true, placeholder: "noreply@example.com" }, settings.fromEmail),
			textField({ key: "fromName", label: "Default From Name", type: "text", placeholder: "Example Site" }, settings.fromName),
			textField({ key: "replyTo", label: "Default Reply-To Email", type: "text", placeholder: "support@example.com" }, settings.replyTo),
			selectField({ key: "logLevel", label: "Log Level", type: "select", options: logLevelOptions }, settings.logLevel ?? "all", logLevelOptions),
		],
		submit: { label: "Save Global Settings", action_id: "save_global" },
	};
}

function buildProviderPickerForm(providerId: string, variant: PluginVariant): FormBlock {
	const options = getProviderPickerOptions(variant);
	return {
		type: "form",
		block_id: "provider-picker",
		fields: [selectField({ key: "providerId", label: "Provider", type: "select", options }, providerId, options)],
		submit: { label: "Load Provider", action_id: "select_provider" },
	};
}

function buildProviderDetails(provider: ProviderDefinition, variant: PluginVariant, configured: boolean): Block[] {
	const available = isProviderAvailable(provider, variant);
	return [
		{
			type: "fields",
			fields: [
				{ label: "Provider", value: provider.label },
				{ label: "Availability", value: available ? "Available" : "Trusted-only" },
				{ label: "Configured", value: configured ? "Yes" : "No" },
				{ label: "Allowed Hosts", value: provider.allowedHosts.length ? provider.allowedHosts.join(", ") : "None" },
			],
		},
		context(provider.description),
	];
}

function buildProviderSettingsForm(
	provider: ProviderDefinition,
	settings: Record<string, unknown>,
): FormBlock {
	const fields = provider.fields.map((field) => {
		if (field.type === "secret") return secretField(field, Boolean(stringValue(settings[field.key])));
		if (field.type === "number") return numberField(field, numberValue(settings[field.key]) ?? (typeof field.defaultValue === "number" ? field.defaultValue : undefined));
		if (field.type === "select") return selectField(field, stringValue(settings[field.key]) ?? (typeof field.defaultValue === "string" ? field.defaultValue : undefined));
		if (field.type === "toggle") return toggleField(field, typeof settings[field.key] === "boolean" ? booleanValue(settings[field.key]) : (typeof field.defaultValue === "boolean" ? field.defaultValue : undefined));
		return textField(field, stringValue(settings[field.key]) ?? (typeof field.defaultValue === "string" ? field.defaultValue : undefined));
	});
	return {
		type: "form",
		block_id: "provider-settings",
		fields,
		submit: { label: "Save Provider Settings", action_id: "save_provider" },
	};
}

function buildProviderSecretActions(
	provider: ProviderDefinition,
	settings: Record<string, unknown>,
): ActionsBlock | null {
	const elements = provider.fields
		.filter((field) => field.type === "secret" && Boolean(stringValue(settings[field.key])))
		.map((field) =>
			button(`clear_secret:${provider.id}:${field.key}`, `Clear ${field.label}`, {
				style: "danger",
				confirm: {
					title: `Clear ${field.label}?`,
					text: `This will remove the stored ${field.label.toLowerCase()} from ${provider.label}.`,
					confirm: "Clear",
					deny: "Cancel",
					style: "danger",
				},
			}),
		);
	return elements.length ? actions(elements) : null;
}

function buildTestSendForm(lastResult: LastTestResult | null): Block[] {
	const blocks: Block[] = [
		{
			type: "form",
			block_id: "test-send",
			fields: [
				{ type: "text_input", action_id: "to", label: "Recipient Email", placeholder: "you@example.com" },
				{ type: "text_input", action_id: "subject", label: "Subject", initial_value: "EmDash SMTP test email" },
				{ type: "text_input", action_id: "text", label: "Message", multiline: true, initial_value: "This is a test email sent from EmDash SMTP." },
			],
			submit: { label: "Send Test Email", action_id: "send_test" },
		},
	];
	if (lastResult) {
		blocks.push(
			banner(
				lastResult.status === "sent" ? "Last test succeeded" : "Last test failed",
				`${lastResult.createdAt}: ${lastResult.message}`,
				lastResult.status === "sent" ? "default" : "error",
			),
		);
	}
	return blocks;
}

async function buildLogsTable(ctx: SmtpPluginContextLike): Promise<TableBlock> {
	const logs = await queryRecentDeliveryLogs(ctx, 25);
	return {
		type: "table",
		page_action_id: "go_logs",
		empty_text: "No delivery logs yet.",
		columns: [
			{ key: "createdAt", label: "Created", format: "relative_time", sortable: true },
			{ key: "status", label: "Status", format: "badge" },
			{ key: "provider", label: "Provider" },
			{ key: "to", label: "To" },
			{ key: "subject", label: "Subject" },
			{ key: "source", label: "Source" },
			{ key: "details", label: "Details", format: "code" },
		],
		rows: logs.map(({ data }) => ({
			createdAt: data.createdAt,
			status: data.status,
			provider: getProviderLabel(data.providerId),
			to: data.message.to,
			subject: data.message.subject,
			source: data.source,
			details: data.errorMessage ?? data.remoteMessageId ?? "—",
		})),
	};
}

async function buildProvidersPage(
	ctx: SmtpPluginContextLike,
	variant: PluginVariant,
	runtime: DeliveryRuntime,
	toast?: BlockResponse["toast"],
): Promise<BlockResponse> {
	const summary = await buildSummary(ctx);
	const settings = await getGlobalSettings(ctx);
	const currentProvider = await getCurrentProvider(ctx, variant);
	const currentProviderSettings = await getProviderSettings(ctx, currentProvider.id);
	const configured = isProviderConfigured(currentProvider, currentProviderSettings);
	const lastTestResult = await getLastTestResult(ctx);
	const secretActions = buildProviderSecretActions(currentProvider, currentProviderSettings);

	const providerRows = await Promise.all(
		SMTP_PROVIDER_DEFINITIONS.map(async (provider) => {
			const providerSettings = await getProviderSettings(ctx, provider.id);
			return {
				provider: provider.label,
				id: provider.id,
				availability: isProviderAvailable(provider, variant) ? "available" : "trusted-only",
				configured: isProviderConfigured(provider, providerSettings) ? "yes" : "no",
				selected: provider.id === currentProvider.id ? "current" : "",
			};
		}),
	);

	const blocks: Block[] = [
		header("SMTP Providers"),
		banner(
			variant === "marketplace" ? "Marketplace-safe variant" : "Trusted variant",
			variant === "marketplace"
				? "This install can use HTTP API providers. Generic SMTP and local sendmail remain visible for parity but are not available here."
				: `This install can use all providers, including Generic SMTP and local sendmail. Allowed hosts: ${collectAllowedHosts("trusted").join(", ")}`,
			variant === "marketplace" ? "alert" : "default",
		),
		stats(summary),
		actions([
			button("go_providers", "Providers", { style: "secondary" }),
			button("go_logs", "View Logs", { style: "primary" }),
		]),
		{
			type: "table",
			page_action_id: "go_providers",
			empty_text: "No providers available.",
			columns: [
				{ key: "provider", label: "Provider" },
				{ key: "id", label: "ID", format: "code" },
				{ key: "availability", label: "Availability", format: "badge" },
				{ key: "configured", label: "Configured", format: "badge" },
				{ key: "selected", label: "Selected", format: "badge" },
			],
			rows: providerRows,
		},
		divider(),
		buildProviderPickerForm(currentProvider.id, variant),
		...buildProviderDetails(currentProvider, variant, configured),
		buildGlobalSettingsForm(settings, variant),
	];

	if (!isProviderAvailable(currentProvider, variant)) {
		blocks.push(
			banner(
				`${currentProvider.label} is not available in the marketplace variant`,
				"Use the trusted @masonjames/emdash-smtp package in astro.config.mjs if you need this transport.",
				"alert",
			),
		);
	} else {
		blocks.push(buildProviderSettingsForm(currentProvider, currentProviderSettings));
		if (secretActions) blocks.push(secretActions);
		blocks.push(...buildTestSendForm(lastTestResult));
	}

	return { blocks, ...(toast ? { toast } : {}) };
}

async function buildLogsPage(
	ctx: SmtpPluginContextLike,
	toast?: BlockResponse["toast"],
): Promise<BlockResponse> {
	const summary = await buildSummary(ctx);
	return {
		blocks: [
			header("SMTP Logs"),
			stats(summary),
			actions([
				button("go_providers", "Providers", { style: "primary" }),
				button("go_logs", "Refresh Logs", { style: "secondary" }),
			]),
			await buildLogsTable(ctx),
		],
		...(toast ? { toast } : {}),
	};
}

async function buildWidgetPage(ctx: SmtpPluginContextLike): Promise<BlockResponse> {
	const summary = await buildSummary(ctx);
	return {
		blocks: [
			stats(summary),
			context("EmDash SMTP monitors the active provider and recent delivery outcomes."),
		],
	};
}

export async function handleAdminInteraction(args: {
	ctx: SmtpPluginContextLike;
	variant: PluginVariant;
	runtime: DeliveryRuntime;
	interaction: AdminInteraction;
}): Promise<BlockResponse> {
	const { ctx, interaction, variant, runtime } = args;

	if (interaction.type === "page_load") {
		if (interaction.page === "/logs") return buildLogsPage(ctx);
		if (interaction.page === "widget:smtp-overview") return buildWidgetPage(ctx);
		return buildProvidersPage(ctx, variant, runtime);
	}

	if (interaction.type === "block_action" || interaction.type === "action") {
		if (interaction.action_id === "go_logs") return buildLogsPage(ctx);
		if (interaction.action_id === "go_providers") return buildProvidersPage(ctx, variant, runtime);
		if (interaction.action_id.startsWith("clear_secret:")) {
			const [, providerId, fieldKey] = interaction.action_id.split(":");
			if (providerId && fieldKey) {
				await clearProviderSecret(ctx, providerId, fieldKey);
				return buildProvidersPage(ctx, variant, runtime, {
					message: `Cleared stored secret for ${fieldKey}.`,
					type: "success",
				});
			}
		}
		return buildProvidersPage(ctx, variant, runtime);
	}

	if (interaction.type === "form_submit") {
		if (interaction.action_id === "save_global") {
			await saveGlobalSettingsFromValues(ctx, interaction.values);
			return buildProvidersPage(ctx, variant, runtime, {
				message: "Global SMTP settings saved.",
				type: "success",
			});
		}

		if (interaction.action_id === "select_provider") {
			const providerId = stringValue(interaction.values.providerId);
			if (providerId) {
				await setSelectedProviderId(ctx, providerId);
			}
			return buildProvidersPage(ctx, variant, runtime, {
				message: "Provider selection updated.",
				type: "info",
			});
		}

		if (interaction.action_id === "save_provider") {
			const provider = await getCurrentProvider(ctx, variant);
			await saveProviderSettingsFromValues(ctx, provider, interaction.values);
			return buildProvidersPage(ctx, variant, runtime, {
				message: `${provider.label} settings saved.`,
				type: "success",
			});
		}

		if (interaction.action_id === "send_test") {
			const to = stringValue(interaction.values.to);
			const subject = stringValue(interaction.values.subject) ?? "EmDash SMTP test email";
			const text = stringValue(interaction.values.text) ?? "This is a test email sent from EmDash SMTP.";
			if (!to) {
				return buildProvidersPage(ctx, variant, runtime, {
					message: "A recipient email address is required for test sends.",
					type: "error",
				});
			}

			try {
				const result = await deliverWithConfiguredProvider({
					ctx,
					runtime,
					message: { to, subject, text },
					source: `${ctx.plugin.id}:test`,
				});
				await writeDeliveryLog(
					ctx,
					createDeliveryLogRecord({
						providerId: result.providerId,
						status: "sent",
						source: `${ctx.plugin.id}:test`,
						durationMs: result.durationMs,
						message: { to, subject },
						remoteMessageId: result.remoteMessageId,
					}),
				);
				await setLastTestResult(ctx, {
					status: "sent",
					providerId: result.providerId,
					message: `Sent with ${getProviderLabel(result.providerId)}${result.remoteMessageId ? ` (${result.remoteMessageId})` : ""}.`,
					createdAt: new Date().toISOString(),
				});
				return buildProvidersPage(ctx, variant, runtime, {
					message: `Test email sent with ${getProviderLabel(result.providerId)}.`,
					type: "success",
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				await writeDeliveryLog(
					ctx,
					createDeliveryLogRecord({
						providerId: "unknown",
						status: "failed",
						source: `${ctx.plugin.id}:test`,
						durationMs: 0,
						message: { to, subject },
						errorMessage: message,
					}),
				);
				await setLastTestResult(ctx, {
					status: "failed",
					message,
					createdAt: new Date().toISOString(),
				});
				return buildProvidersPage(ctx, variant, runtime, {
					message,
					type: "error",
				});
			}
		}
	}

	return buildProvidersPage(ctx, variant, runtime);
}
