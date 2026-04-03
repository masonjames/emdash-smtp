export type PluginVariant = "trusted" | "marketplace";
export type LogLevel = "all" | "errors" | "off";
export type DeliveryStatus = "sent" | "failed";

export interface DeliveryMessage {
	to: string[];
	subject: string;
	text: string;
	html?: string;
	fromEmail?: string;
	fromName?: string;
	replyTo?: string[];
}

export interface DeliveryResult {
	providerId: string;
	remoteMessageId?: string;
	durationMs: number;
}

export interface SmtpRuntimeTransportConfig {
	host: string;
	port: number;
	secure: boolean;
	username?: string;
	password?: string;
}

export interface LocalRuntimeTransportConfig {
	sendmailPath?: string;
	fromEmail: string;
	fromName?: string;
}

export interface DeliveryRuntime {
	variant: PluginVariant;
	fetch?: (url: string, init?: RequestInit) => Promise<Response>;
	smtpSend?: (
		config: SmtpRuntimeTransportConfig,
		message: DeliveryMessage,
	) => Promise<{ remoteMessageId?: string }>;
	sendmailSend?: (
		config: LocalRuntimeTransportConfig,
		message: DeliveryMessage,
	) => Promise<{ remoteMessageId?: string }>;
}

export interface QueryOptionsLike {
	where?: Record<string, unknown>;
	orderBy?: Record<string, "asc" | "desc">;
	limit?: number;
	cursor?: string;
}

export interface PaginatedResultLike<T> {
	items: T[];
	cursor?: string;
	hasMore?: boolean;
}

export interface StorageCollectionLike<T = unknown> {
	get?(id: string): Promise<T | null>;
	put(id: string, data: T): Promise<void>;
	delete?(id: string): Promise<boolean>;
	query?(options?: QueryOptionsLike): Promise<PaginatedResultLike<{ id: string; data: T }>>;
	count?(where?: Record<string, unknown>): Promise<number>;
}

export interface KVLike {
	get<T>(key: string): Promise<T | null>;
	set(key: string, value: unknown): Promise<void>;
	delete?(key: string): Promise<boolean>;
	list?(prefix?: string): Promise<Array<{ key: string; value: unknown }>>;
}

export interface LoggerLike {
	debug(message: string, data?: unknown): void;
	info(message: string, data?: unknown): void;
	warn(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
}

export interface DeliveryLogRecord {
	id?: string;
	createdAt: string;
	providerId: string;
	status: DeliveryStatus;
	source: string;
	durationMs: number;
	message: {
		to: string;
		subject: string;
	};
	remoteMessageId?: string;
	errorMessage?: string;
}

export interface SmtpPluginContextLike {
	plugin: {
		id: string;
		version: string;
	};
	kv: KVLike;
	storage?: {
		deliveryLogs?: StorageCollectionLike<DeliveryLogRecord>;
		[key: string]: StorageCollectionLike<unknown> | undefined;
	};
	log?: LoggerLike;
}

export interface GlobalSettings {
	primaryProviderId?: string;
	fallbackProviderId?: string;
	fromEmail?: string;
	fromName?: string;
	replyTo?: string;
	logLevel?: LogLevel;
}

export interface ProviderFieldOption {
	label: string;
	value: string;
}

export type ProviderFieldType = "text" | "textarea" | "secret" | "number" | "select" | "toggle";

export interface ProviderFieldDefinition {
	key: string;
	label: string;
	type: ProviderFieldType;
	required?: boolean;
	placeholder?: string;
	description?: string;
	multiline?: boolean;
	defaultValue?: string | number | boolean;
	options?: ProviderFieldOption[];
}

export interface ProviderSendArgs {
	ctx: SmtpPluginContextLike;
	providerId: string;
	settings: Record<string, unknown>;
	message: DeliveryMessage;
	runtime: DeliveryRuntime;
}

export interface ProviderDefinition {
	id: string;
	label: string;
	description: string;
	availability: Record<PluginVariant, boolean>;
	allowedHosts: string[];
	fields: ProviderFieldDefinition[];
	isConfigured?: (settings: Record<string, unknown>) => boolean;
	send: (args: ProviderSendArgs) => Promise<{ remoteMessageId?: string }>;
}

export interface CountSummary {
	activeProviderLabel: string;
	sentCount: number;
	failedCount: number;
}

export interface BlockButtonConfirm {
	title: string;
	text: string;
	confirm: string;
	deny: string;
	style?: "danger";
}

export interface BlockButtonElement {
	type: "button";
	action_id: string;
	label: string;
	style?: "primary" | "danger" | "secondary";
	value?: unknown;
	confirm?: BlockButtonConfirm;
}

export interface BlockTextInputElement {
	type: "text_input";
	action_id: string;
	label: string;
	placeholder?: string;
	initial_value?: string;
	multiline?: boolean;
}

export interface BlockNumberInputElement {
	type: "number_input";
	action_id: string;
	label: string;
	initial_value?: number;
	min?: number;
	max?: number;
}

export interface BlockSelectElement {
	type: "select";
	action_id: string;
	label: string;
	options: ProviderFieldOption[];
	initial_value?: string;
}

export interface BlockToggleElement {
	type: "toggle";
	action_id: string;
	label: string;
	description?: string;
	initial_value?: boolean;
}

export interface BlockSecretInputElement {
	type: "secret_input";
	action_id: string;
	label: string;
	placeholder?: string;
	has_value?: boolean;
}

export type BlockElement =
	| BlockButtonElement
	| BlockTextInputElement
	| BlockNumberInputElement
	| BlockSelectElement
	| BlockToggleElement
	| BlockSecretInputElement;

export interface HeaderBlock {
	type: "header";
	text: string;
	block_id?: string;
}

export interface ContextBlock {
	type: "context";
	text: string;
	block_id?: string;
}

export interface DividerBlock {
	type: "divider";
	block_id?: string;
}

export interface BannerBlock {
	type: "banner";
	title?: string;
	description?: string;
	variant?: "default" | "alert" | "error";
	block_id?: string;
}

export interface FieldsBlock {
	type: "fields";
	fields: Array<{ label: string; value: string }>;
	block_id?: string;
}

export interface SectionBlock {
	type: "section";
	text: string;
	accessory?: BlockElement;
	block_id?: string;
}

export interface ActionsBlock {
	type: "actions";
	elements: BlockElement[];
	block_id?: string;
}

export interface StatsBlock {
	type: "stats";
	items: Array<{
		label: string;
		value: string | number;
		description?: string;
		trend?: "up" | "down" | "neutral";
	}>;
	block_id?: string;
}

export interface FormBlock {
	type: "form";
	fields: Array<(BlockTextInputElement | BlockNumberInputElement | BlockSelectElement | BlockToggleElement | BlockSecretInputElement) & { condition?: { field: string; eq?: unknown; neq?: unknown } }>;
	submit: {
		label: string;
		action_id: string;
	};
	block_id?: string;
}

export interface TableBlock {
	type: "table";
	columns: Array<{
		key: string;
		label: string;
		format?: "text" | "badge" | "relative_time" | "number" | "code";
		sortable?: boolean;
	}>;
	rows: Array<Record<string, unknown>>;
	next_cursor?: string;
	page_action_id: string;
	empty_text?: string;
	block_id?: string;
}

export type Block =
	| HeaderBlock
	| ContextBlock
	| DividerBlock
	| BannerBlock
	| FieldsBlock
	| SectionBlock
	| ActionsBlock
	| StatsBlock
	| FormBlock
	| TableBlock;

export interface BlockResponse {
	blocks: Block[];
	toast?: {
		message: string;
		type: "success" | "error" | "info";
	};
}

export interface PageLoadInteraction {
	type: "page_load";
	page: string;
}

export interface FormSubmitInteraction {
	type: "form_submit";
	action_id: string;
	block_id?: string;
	values: Record<string, unknown>;
}

export interface BlockActionInteraction {
	type: "block_action" | "action";
	action_id: string;
	block_id?: string;
	value?: unknown;
}

export type AdminInteraction = PageLoadInteraction | FormSubmitInteraction | BlockActionInteraction;

export interface LastTestResult {
	status: DeliveryStatus;
	providerId?: string;
	message: string;
	createdAt: string;
}
