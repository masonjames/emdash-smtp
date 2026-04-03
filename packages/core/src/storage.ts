import type {
	AdminInteraction,
	DeliveryLogRecord,
	GlobalSettings,
	LastTestResult,
	LogLevel,
	ProviderDefinition,
	SmtpPluginContextLike,
} from "./types.js";

export const GLOBAL_SETTINGS_KEY = "settings:global";
export const SELECTED_PROVIDER_KEY = "state:selectedProviderId";
export const LAST_TEST_RESULT_KEY = "state:lastTestResult";

function providerSettingsKey(providerId: string): string {
	return `settings:provider:${providerId}`;
}

function trimString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const next = value.trim();
	return next === "" ? undefined : next;
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const next = Number(value);
		if (Number.isFinite(next)) return next;
	}
	return undefined;
}

function booleanValue(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		return value === "true" || value === "1" || value === "on";
	}
	return Boolean(value);
}

function normalizeLogLevel(value: unknown): LogLevel {
	if (value === "errors" || value === "off") return value;
	return "all";
}

function cleanRecord(record: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export async function getGlobalSettings(ctx: SmtpPluginContextLike): Promise<GlobalSettings> {
	const saved = (await ctx.kv.get<GlobalSettings>(GLOBAL_SETTINGS_KEY)) ?? {};
	return {
		primaryProviderId: trimString(saved.primaryProviderId),
		fallbackProviderId: trimString(saved.fallbackProviderId),
		fromEmail: trimString(saved.fromEmail),
		fromName: trimString(saved.fromName),
		replyTo: trimString(saved.replyTo),
		logLevel: normalizeLogLevel(saved.logLevel),
	};
}

export async function saveGlobalSettingsFromValues(
	ctx: SmtpPluginContextLike,
	values: Record<string, unknown>,
): Promise<GlobalSettings> {
	const next: GlobalSettings = {
		primaryProviderId: trimString(values.primaryProviderId),
		fallbackProviderId: trimString(values.fallbackProviderId),
		fromEmail: trimString(values.fromEmail),
		fromName: trimString(values.fromName),
		replyTo: trimString(values.replyTo),
		logLevel: normalizeLogLevel(values.logLevel),
	};
	await ctx.kv.set(GLOBAL_SETTINGS_KEY, next);
	return next;
}

export async function getProviderSettings(
	ctx: SmtpPluginContextLike,
	providerId: string,
): Promise<Record<string, unknown>> {
	return ((await ctx.kv.get<Record<string, unknown>>(providerSettingsKey(providerId))) ?? {}) as Record<
		string,
		unknown
	>;
}

export async function patchProviderSettings(
	ctx: SmtpPluginContextLike,
	providerId: string,
	patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const current = await getProviderSettings(ctx, providerId);
	const cleaned = cleanRecord({ ...current, ...patch });
	await ctx.kv.set(providerSettingsKey(providerId), cleaned);
	return cleaned;
}

export async function saveProviderSettingsFromValues(
	ctx: SmtpPluginContextLike,
	provider: ProviderDefinition,
	values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const existing = await getProviderSettings(ctx, provider.id);
	const next: Record<string, unknown> = {};

	for (const field of provider.fields) {
		const raw = values[field.key];
		if (field.type === "secret") {
			const secret = trimString(raw);
			if (secret !== undefined) {
				next[field.key] = secret;
			} else if (existing[field.key] !== undefined) {
				next[field.key] = existing[field.key];
			}
			continue;
		}

		if (field.type === "number") {
			const numeric = numberValue(raw);
			if (numeric !== undefined) next[field.key] = numeric;
			continue;
		}

		if (field.type === "toggle") {
			next[field.key] = booleanValue(raw);
			continue;
		}

		const text = trimString(raw);
		if (text !== undefined) next[field.key] = text;
	}

	const cleaned = cleanRecord(next);
	await ctx.kv.set(providerSettingsKey(provider.id), cleaned);
	return cleaned;
}

export async function clearProviderSecret(
	ctx: SmtpPluginContextLike,
	providerId: string,
	fieldKey: string,
): Promise<void> {
	const current = await getProviderSettings(ctx, providerId);
	const next = { ...current };
	delete next[fieldKey];
	await ctx.kv.set(providerSettingsKey(providerId), cleanRecord(next));
}

export async function getSelectedProviderId(
	ctx: SmtpPluginContextLike,
): Promise<string | undefined> {
	return trimString(await ctx.kv.get<string>(SELECTED_PROVIDER_KEY));
}

export async function setSelectedProviderId(
	ctx: SmtpPluginContextLike,
	providerId: string,
): Promise<void> {
	await ctx.kv.set(SELECTED_PROVIDER_KEY, providerId);
}

export async function getLastTestResult(
	ctx: SmtpPluginContextLike,
): Promise<LastTestResult | null> {
	return await ctx.kv.get<LastTestResult>(LAST_TEST_RESULT_KEY);
}

export async function setLastTestResult(
	ctx: SmtpPluginContextLike,
	result: LastTestResult,
): Promise<void> {
	await ctx.kv.set(LAST_TEST_RESULT_KEY, result);
}

export function createDeliveryLogRecord(
	input: Omit<DeliveryLogRecord, "createdAt"> & { createdAt?: string },
): DeliveryLogRecord {
	return {
		...input,
		createdAt: input.createdAt ?? new Date().toISOString(),
	};
}

function createLogId(record: DeliveryLogRecord): string {
	const base = record.createdAt.replace(/[^0-9]/g, "").slice(0, 14);
	const random = Math.random().toString(36).slice(2, 10);
	return `${base}-${record.providerId}-${random}`;
}

export async function writeDeliveryLog(
	ctx: SmtpPluginContextLike,
	record: DeliveryLogRecord,
): Promise<void> {
	const collection = ctx.storage?.deliveryLogs;
	if (!collection?.put) return;

	const settings = await getGlobalSettings(ctx);
	const logLevel = settings.logLevel ?? "all";
	if (logLevel === "off") return;
	if (logLevel === "errors" && record.status !== "failed") return;

	const id = record.id ?? createLogId(record);
	await collection.put(id, { ...record, id });
}

export async function queryRecentDeliveryLogs(
	ctx: SmtpPluginContextLike,
	limit = 25,
): Promise<Array<{ id: string; data: DeliveryLogRecord }>> {
	const collection = ctx.storage?.deliveryLogs;
	if (!collection?.query) return [];
	const result = await collection.query({ orderBy: { createdAt: "desc" }, limit });
	return result.items ?? [];
}

export async function countDeliveryLogs(
	ctx: SmtpPluginContextLike,
	status: "sent" | "failed",
): Promise<number> {
	const collection = ctx.storage?.deliveryLogs;
	if (collection?.count) {
		return collection.count({ status });
	}
	if (!collection?.query) return 0;
	const result = await collection.query({ where: { status }, limit: 1000 });
	return result.items.length;
}
