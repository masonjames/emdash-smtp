import {
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
export const SMTP_PLUGIN_VERSION = "0.3.4";
const RECOMMENDED_PROVIDER_IDS = ["resend", "postmark", "sendgrid", "mailgun", "generic"] as const;

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
	primaryProviderId?: string,
): Promise<ProviderDefinition> {
	const selected = await getSelectedProviderId(ctx);
	const preferred = selected ? getProviderById(selected) : primaryProviderId ? getProviderById(primaryProviderId) : undefined;
	if (preferred) return preferred;
	for (const providerId of RECOMMENDED_PROVIDER_IDS) {
		const recommended = getProviderById(providerId);
		if (recommended && isProviderAvailable(recommended, variant)) return recommended;
	}
	return (
		SMTP_PROVIDER_DEFINITIONS.find((provider) => isProviderAvailable(provider, variant)) ??
		SMTP_PROVIDER_DEFINITIONS[0]!
	);
}

function buildSenderSettingsForm(settings: GlobalSettings): FormBlock {
	const logLevelOptions = [
		{ label: "All deliveries", value: "all" },
		{ label: "Errors only", value: "errors" },
		{ label: "Disabled", value: "off" },
	];
	return {
		type: "form",
		block_id: "global-settings",
		fields: [
			textField({ key: "fromEmail", label: "Default From Email", type: "text", required: true, placeholder: "noreply@example.com" }, settings.fromEmail),
			textField({ key: "fromName", label: "Default From Name", type: "text", placeholder: "Example Site" }, settings.fromName),
			textField({ key: "replyTo", label: "Default Reply-To Email", type: "text", placeholder: "support@example.com" }, settings.replyTo),
			selectField({ key: "logLevel", label: "Log Level", type: "select", options: logLevelOptions }, settings.logLevel ?? "all", logLevelOptions),
		],
		submit: { label: "Save Sender Settings", action_id: "save_global" },
	};
}

function buildProviderPickerForm(providerId: string, variant: PluginVariant): FormBlock {
	const options = getProviderPickerOptions(variant);
	return {
		type: "form",
		block_id: "provider-browser",
		fields: [
			selectField(
				{ key: "providerId", label: "Browse every provider", type: "select", options },
				providerId,
				options,
			),
		],
		submit: { label: "Switch Provider", action_id: "select_provider" },
	};
}

type ProviderRoutingRole = "primary" | "fallback" | "none";

interface ProviderCatalogEntry {
	provider: ProviderDefinition;
	available: boolean;
	configured: boolean;
	selected: boolean;
	routingRole: ProviderRoutingRole;
}

function getProviderRoutingRole(provider: ProviderDefinition, settings: GlobalSettings): ProviderRoutingRole {
	if (settings.primaryProviderId === provider.id) return "primary";
	if (settings.fallbackProviderId === provider.id) return "fallback";
	return "none";
}

function routingRoleLabel(role: ProviderRoutingRole): string {
	if (role === "primary") return "Primary";
	if (role === "fallback") return "Fallback";
	return "Not routed";
}

function setupNextStep(settings: GlobalSettings, configured: boolean, routingRole: ProviderRoutingRole): string {
	if (!configured) return "Add credentials";
	if (routingRole === "none") return "Set delivery route";
	if (!settings.fromEmail) return "Add sender";
	return "Ready to test";
}

function routeSummary(provider: ProviderDefinition, routingRole: ProviderRoutingRole): string {
	if (routingRole === "primary") return `${provider.label} handles delivery`;
	if (routingRole === "fallback") return `${provider.label} is the fallback`;
	return "Not routed";
}

async function buildProviderCatalogEntries(
	ctx: SmtpPluginContextLike,
	variant: PluginVariant,
	settings: GlobalSettings,
	currentProvider: ProviderDefinition,
): Promise<ProviderCatalogEntry[]> {
	return Promise.all(
		SMTP_PROVIDER_DEFINITIONS.map(async (provider) => {
			const providerSettings = await getProviderSettings(ctx, provider.id);
			return {
				provider,
				available: isProviderAvailable(provider, variant),
				configured: isProviderConfigured(provider, providerSettings),
				selected: provider.id === currentProvider.id,
				routingRole: getProviderRoutingRole(provider, settings),
			};
		}),
	);
}

function buildProviderQuickPicks(entries: ProviderCatalogEntry[]): Block[] {
	const quickPicks = RECOMMENDED_PROVIDER_IDS
		.map((providerId) => entries.find((entry) => entry.provider.id === providerId && entry.available))
		.filter((entry): entry is ProviderCatalogEntry => Boolean(entry));

	const blocks: Block[] = [
		{
			type: "section",
			text: "Provider",
		},
	];

	if (quickPicks.length > 0) {
		blocks.push(
			actions(
				quickPicks.map((entry) =>
					button(`select_provider:${entry.provider.id}`, entry.provider.label, {
						style: entry.selected ? "primary" : "secondary",
						value: entry.provider.id,
					}),
				),
			),
		);
	}

	return blocks;
}

function buildRoutingActions(settings: GlobalSettings, currentProvider: ProviderDefinition): Block[] {
	const elements: BlockElement[] = [];

	if (settings.primaryProviderId !== currentProvider.id) {
		elements.push(
			button("set_primary_provider", `Use ${currentProvider.label} for delivery`, {
				style: "primary",
				value: currentProvider.id,
			}),
		);
	} else {
		elements.push(
			button("set_primary_provider", "Primary provider", {
				style: "secondary",
				value: currentProvider.id,
			}),
		);
	}

	if (settings.fallbackProviderId === currentProvider.id) {
		elements.push(button("clear_fallback_provider", "Remove fallback", { style: "secondary" }));
	} else if (settings.primaryProviderId && settings.primaryProviderId !== currentProvider.id) {
		elements.push(
			button("set_fallback_provider", "Use as fallback", {
				style: "secondary",
				value: currentProvider.id,
			}),
		);
	} else if (settings.fallbackProviderId) {
		elements.push(button("clear_fallback_provider", "Clear fallback", { style: "secondary" }));
	}

	return elements.length ? [actions(elements)] : [];
}

function buildSetupOverview(
	settings: GlobalSettings,
	currentProvider: ProviderDefinition,
	configured: boolean,
	routingRole: ProviderRoutingRole,
): Block[] {
	return [
		{
			type: "section",
			text: "Current setup",
		},
		{
			type: "table",
			page_action_id: "go_providers",
			columns: [
				{ key: "area", label: "Area" },
				{ key: "status", label: "Status" },
				{ key: "next", label: "Next" },
			],
			rows: [
				{
					area: currentProvider.label,
					status: configured ? "Ready" : "Needs setup",
					next: setupNextStep(settings, configured, routingRole),
				},
				{
					area: "Delivery route",
					status: routeSummary(currentProvider, routingRole),
					next: routingRole === "none" ? `Use ${currentProvider.label}` : "Set",
				},
				{
					area: "Sender",
					status: settings.fromEmail ?? "Not set",
					next: settings.fromEmail ? "Saved" : "Add default",
				},
			],
		},
	];
}

function buildProviderDetails(
	provider: ProviderDefinition,
	variant: PluginVariant,
	configured: boolean,
	routingRole: ProviderRoutingRole,
): Block[] {
	const available = isProviderAvailable(provider, variant);
	const statusParts = [
		available ? "Available" : "Trusted only",
		configured ? "settings ready" : "needs credentials",
		routeSummary(provider, routingRole),
	];
	return [
		context(statusParts.join(" · ")),
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
	const currentProvider = await getCurrentProvider(ctx, variant, settings.primaryProviderId);
	const currentProviderSettings = await getProviderSettings(ctx, currentProvider.id);
	const configured = isProviderConfigured(currentProvider, currentProviderSettings);
	const currentRoutingRole = getProviderRoutingRole(currentProvider, settings);
	const catalogEntries = await buildProviderCatalogEntries(ctx, variant, settings, currentProvider);
	const lastTestResult = await getLastTestResult(ctx);
	const secretActions = buildProviderSecretActions(currentProvider, currentProviderSettings);

	const blocks: Block[] = [header("SMTP Providers")];
	if (variant === "marketplace") {
		blocks.push(banner("Marketplace install", "HTTP API providers are available.", "alert"));
	}
	blocks.push(
		stats(summary),
		actions([
			button("go_providers", "Providers", { style: "secondary" }),
			button("go_logs", "View Logs", { style: "primary" }),
		]),
		...buildSetupOverview(settings, currentProvider, configured, currentRoutingRole),
		...buildProviderQuickPicks(catalogEntries),
		divider(),
		{
			type: "section",
			text: `${currentProvider.label} setup`,
		},
		...buildProviderDetails(currentProvider, variant, configured, currentRoutingRole),
	);

	if (!isProviderAvailable(currentProvider, variant)) {
		blocks.push(
			banner(
				`${currentProvider.label} is not available in the marketplace variant`,
				"Use the trusted emdash-smtp package in astro.config.mjs if you need this transport.",
				"alert",
			),
		);
	} else {
		blocks.push(buildProviderSettingsForm(currentProvider, currentProviderSettings));
		if (secretActions) blocks.push(secretActions);
	}

	blocks.push(divider());
	blocks.push({ type: "section", text: "Sender identity" });
	blocks.push(...buildRoutingActions(settings, currentProvider));
	blocks.push(buildSenderSettingsForm(settings));
	blocks.push(divider());
	blocks.push({ type: "section", text: "Need a different provider?" });
	blocks.push(buildProviderPickerForm(currentProvider.id, variant));
	blocks.push(divider());
	blocks.push({ type: "section", text: "Test delivery" });
	blocks.push(...buildTestSendForm(lastTestResult));

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
		if (interaction.action_id === "select_provider" || interaction.action_id.startsWith("select_provider:")) {
			const providerId =
				stringValue(interaction.value) ??
				(interaction.action_id.startsWith("select_provider:")
					? stringValue(interaction.action_id.split(":")[1])
					: undefined);
			if (providerId && getProviderById(providerId)) {
				await setSelectedProviderId(ctx, providerId);
				return buildProvidersPage(ctx, variant, runtime, {
					message: `Editing ${getProviderLabel(providerId)}.`,
					type: "info",
				});
			}
			return buildProvidersPage(ctx, variant, runtime, {
				message: "Provider could not be selected.",
				type: "error",
			});
		}
		if (interaction.action_id === "set_primary_provider") {
			const providerId = stringValue(interaction.value);
			const provider = providerId ? getProviderById(providerId) : undefined;
			if (provider && isProviderAvailable(provider, variant)) {
				const settings = await getGlobalSettings(ctx);
				await saveGlobalSettingsFromValues(ctx, {
					primaryProviderId: provider.id,
					...(settings.fallbackProviderId === provider.id ? { fallbackProviderId: "" } : {}),
				});
				return buildProvidersPage(ctx, variant, runtime, {
					message: `${provider.label} is now the delivery provider.`,
					type: "success",
				});
			}
			return buildProvidersPage(ctx, variant, runtime, {
				message: "Provider could not be routed.",
				type: "error",
			});
		}
		if (interaction.action_id === "set_fallback_provider") {
			const providerId = stringValue(interaction.value);
			const provider = providerId ? getProviderById(providerId) : undefined;
			const settings = await getGlobalSettings(ctx);
			if (provider && isProviderAvailable(provider, variant) && settings.primaryProviderId !== provider.id) {
				await saveGlobalSettingsFromValues(ctx, { fallbackProviderId: provider.id });
				return buildProvidersPage(ctx, variant, runtime, {
					message: `${provider.label} is now the fallback provider.`,
					type: "success",
				});
			}
			return buildProvidersPage(ctx, variant, runtime, {
				message: "Fallback provider could not be routed.",
				type: "error",
			});
		}
		if (interaction.action_id === "clear_fallback_provider") {
			await saveGlobalSettingsFromValues(ctx, { fallbackProviderId: "" });
			return buildProvidersPage(ctx, variant, runtime, {
				message: "Fallback provider cleared.",
				type: "success",
			});
		}
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
				message: "Sender settings saved.",
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
			const provider = await getCurrentProvider(ctx, variant, (await getGlobalSettings(ctx)).primaryProviderId);
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
