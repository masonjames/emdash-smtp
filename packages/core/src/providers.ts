import { patchProviderSettings } from "./storage.js";
import type {
	DeliveryMessage,
	DeliveryRuntime,
	PluginVariant,
	ProviderDefinition,
	ProviderFieldDefinition,
	ProviderSendArgs,
} from "./types.js";

function unique(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))].sort();
}

function stringValue(settings: Record<string, unknown>, key: string): string | undefined {
	const value = settings[key];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

function numberValue(settings: Record<string, unknown>, key: string, fallback?: number): number | undefined {
	const value = settings[key];
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

function requireString(settings: Record<string, unknown>, key: string, label: string): string {
	const value = stringValue(settings, key);
	if (!value) {
		throw new Error(`${label} is required.`);
	}
	return value;
}

function sanitizeHeaderText(value: string): string {
	return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeEmailAddress(value: string, label: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${label} is required.`);
	}
	if (/[\r\n]/.test(trimmed)) {
		throw new Error(`${label} contains invalid newline characters.`);
	}
	return trimmed;
}

function encodeHeaderValue(value: string): string {
	const sanitized = sanitizeHeaderText(value);
	if (/^[\x20-\x7E]*$/.test(sanitized) && !/[",]/.test(sanitized)) {
		return sanitized;
	}
	return `=?UTF-8?B?${toBase64(new TextEncoder().encode(sanitized))}?=`;
}

function formatAddress(email: string, name?: string): string {
	const safeEmail = sanitizeEmailAddress(email, "Email address");
	const safeName = name ? encodeHeaderValue(name) : undefined;
	return safeName ? `${safeName} <${safeEmail}>` : safeEmail;
}

function ensureFetch(runtime: DeliveryRuntime): NonNullable<DeliveryRuntime["fetch"]> {
	if (!runtime.fetch) {
		throw new Error("This provider requires network fetch support in the current runtime.");
	}
	return runtime.fetch;
}

function ensureSmtp(runtime: DeliveryRuntime): NonNullable<DeliveryRuntime["smtpSend"]> {
	if (!runtime.smtpSend) {
		throw new Error("Custom SMTP is only available in the trusted package.");
	}
	return runtime.smtpSend;
}

function ensureSendmail(runtime: DeliveryRuntime): NonNullable<DeliveryRuntime["sendmailSend"]> {
	if (!runtime.sendmailSend) {
		throw new Error("Local sendmail is only available in the trusted package.");
	}
	return runtime.sendmailSend;
}

async function readResponse(response: Response): Promise<{ text: string; json?: unknown }> {
	const text = await response.text();
	try {
		return { text, json: text ? JSON.parse(text) : undefined };
	} catch {
		return { text };
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
	return Array.isArray(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function getPath(value: unknown, ...path: Array<string | number>): unknown {
	let current: unknown = value;
	for (const segment of path) {
		if (typeof segment === "number") {
			const items = asArray(current);
			if (!items) return undefined;
			current = items[segment];
			continue;
		}
		const record = asRecord(current);
		if (!record) return undefined;
		current = record[segment];
	}
	return current;
}

class HttpError extends Error {
	status: number;
	bodyText: string;
	bodyJson?: unknown;

	constructor(status: number, bodyText: string, bodyJson?: unknown) {
		super(bodyText || `HTTP ${status}`);
		this.name = "HttpError";
		this.status = status;
		this.bodyText = bodyText;
		this.bodyJson = bodyJson;
	}
}

function hasAllSettings(settings: Record<string, unknown>, keys: string[]): boolean {
	return keys.every((key) => Boolean(stringValue(settings, key)));
}

function shouldRetryAfterRefresh(error: unknown): error is HttpError {
	return error instanceof HttpError && (error.status === 401 || error.status === 403);
}

async function refreshProviderAccessToken(
	args: ProviderSendArgs,
	tokenUrl: string,
	body: URLSearchParams,
	label: string,
): Promise<string> {
	const { json } = await requestJson({
		url: tokenUrl,
		runtime: args.runtime,
		ok: [200],
		init: {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		},
	});
	const accessToken = asString(getPath(json, "access_token"));
	if (!accessToken) {
		throw new Error(`${label} refresh did not return an access token.`);
	}
	const refreshToken = asString(getPath(json, "refresh_token"));
	await patchProviderSettings(args.ctx, args.providerId, {
		accessToken,
		...(refreshToken ? { refreshToken } : {}),
	});
	return accessToken;
}

async function requestJson(opts: {
	url: string;
	init: RequestInit;
	runtime: DeliveryRuntime;
	ok?: number[];
}): Promise<{ response: Response; text: string; json?: unknown }> {
	const fetchFn = ensureFetch(opts.runtime);
	const response = await fetchFn(opts.url, opts.init);
	const result = await readResponse(response);
	const ok = opts.ok ?? [200, 201, 202];
	if (!ok.includes(response.status)) {
		throw new HttpError(response.status, result.text || `HTTP ${response.status}`, result.json);
	}
	return { response, ...result };
}

function toBase64(bytes: Uint8Array): string {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(bytes).toString("base64");
	}
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function toBase64Url(text: string): string {
	const bytes = new TextEncoder().encode(text);
	return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function sha256Hex(payload: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
	return toHex(new Uint8Array(digest));
}

async function hmacSha256Raw(key: string | Uint8Array, data: string): Promise<Uint8Array> {
	const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : Uint8Array.from(key);
	const imported = await crypto.subtle.importKey(
		"raw",
		rawKey.buffer,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(data));
	return new Uint8Array(signature);
}

function stripHtml(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function buildMimeMessage(message: DeliveryMessage): string {
	const from = formatAddress(message.fromEmail || "", message.fromName);
	const to = message.to.map((email) => sanitizeEmailAddress(email, "Recipient email address")).join(", ");
	const replyTo = message.replyTo?.length
		? message.replyTo.map((email) => sanitizeEmailAddress(email, "Reply-to email address")).join(", ")
		: undefined;
	const subject = encodeHeaderValue(message.subject);
	const headers = [
		`From: ${from}`,
		`To: ${to}`,
		`Subject: ${subject}`,
		...(replyTo ? [`Reply-To: ${replyTo}`] : []),
		"MIME-Version: 1.0",
	];

	if (message.html) {
		const boundary = `emdash-${Math.random().toString(36).slice(2, 12)}`;
		return [
			...headers,
			`Content-Type: multipart/alternative; boundary="${boundary}"`,
			"",
			`--${boundary}`,
			'Content-Type: text/plain; charset="UTF-8"',
			"",
			message.text,
			"",
			`--${boundary}`,
			'Content-Type: text/html; charset="UTF-8"',
			"",
			message.html,
			"",
			`--${boundary}--`,
			"",
		].join("\r\n");
	}

	return [
		...headers,
		'Content-Type: text/plain; charset="UTF-8"',
		"",
		message.text,
		"",
	].join("\r\n");
}

async function signAwsRequest(opts: {
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	url: URL;
	method: string;
	payload: string;
	headers?: Record<string, string>;
}): Promise<Record<string, string>> {
	const now = new Date();
	const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
	const dateStamp = amzDate.slice(0, 8);
	const service = "ses";
	const payloadHash = await sha256Hex(opts.payload);
	const baseHeaders: Record<string, string> = {
		"content-type": "application/x-www-form-urlencoded; charset=utf-8",
		"host": opts.url.host,
		"x-amz-content-sha256": payloadHash,
		"x-amz-date": amzDate,
		...(opts.headers ?? {}),
	};
	const sortedHeaderKeys = Object.keys(baseHeaders).sort();
	const canonicalHeaders = sortedHeaderKeys
		.map((key) => `${key}:${(baseHeaders[key] ?? "").trim()}\n`)
		.join("");
	const signedHeaders = sortedHeaderKeys.join(";");
	const canonicalRequest = [
		opts.method,
		opts.url.pathname || "/",
		opts.url.search.startsWith("?") ? opts.url.search.slice(1) : opts.url.search,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join("\n");
	const credentialScope = `${dateStamp}/${opts.region}/${service}/aws4_request`;
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		await sha256Hex(canonicalRequest),
	].join("\n");
	const kDate = await hmacSha256Raw(`AWS4${opts.secretAccessKey}`, dateStamp);
	const kRegion = await hmacSha256Raw(kDate, opts.region);
	const kService = await hmacSha256Raw(kRegion, service);
	const kSigning = await hmacSha256Raw(kService, "aws4_request");
	const signature = toHex(await hmacSha256Raw(kSigning, stringToSign));
	return {
		...baseHeaders,
		Authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
	};
}

function getMessageText(message: DeliveryMessage): string {
	return message.text || (message.html ? stripHtml(message.html) : "");
}

async function sendViaAmazon(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const accessKeyId = requireString(args.settings, "accessKeyId", "Access Key ID");
	const secretAccessKey = requireString(args.settings, "secretAccessKey", "Secret Access Key");
	const region = requireString(args.settings, "region", "Region");
	const payload = new URLSearchParams({
		Action: "SendRawEmail",
		Version: "2010-12-01",
		"RawMessage.Data": toBase64(new TextEncoder().encode(buildMimeMessage(args.message))),
	}).toString();
	const url = new URL(`https://email.${region}.amazonaws.com/`);
	const headers = await signAwsRequest({
		accessKeyId,
		secretAccessKey,
		region,
		url,
		method: "POST",
		payload,
	});
	const { text } = await requestJson({
		url: url.toString(),
		runtime: args.runtime,
		ok: [200],
		init: { method: "POST", headers, body: payload },
	});
	const match = text.match(/<MessageId>([^<]+)<\/MessageId>/i);
	return { remoteMessageId: match?.[1] };
}

async function sendViaBrevo(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "API Key");
	const body: Record<string, unknown> = {
		sender: {
			email: args.message.fromEmail,
			...(args.message.fromName ? { name: args.message.fromName } : {}),
		},
		to: args.message.to.map((email) => ({ email })),
		subject: args.message.subject,
		...(args.message.html ? { htmlContent: args.message.html } : { textContent: args.message.text }),
		...(args.message.replyTo?.[0] ? { replyTo: { email: args.message.replyTo[0] } } : {}),
	};
	const { json } = await requestJson({
		url: "https://api.brevo.com/v3/smtp/email",
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				"api-key": apiKey,
			},
			body: JSON.stringify(body),
		},
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(record?.messageId) };
}

async function sendViaElasticEmail(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "API Key");
	const body: Record<string, unknown> = {
		Recipients: { To: [...args.message.to] },
		Content: {
			From: formatAddress(args.message.fromEmail || "", args.message.fromName),
			Subject: args.message.subject,
			Body: [
				{
					Charset: "utf-8",
					Content: args.message.html || args.message.text,
					ContentType: args.message.html ? "HTML" : "PlainText",
				},
			],
			...(args.message.replyTo?.[0] ? { ReplyTo: args.message.replyTo[0] } : {}),
		},
	};
	const { json } = await requestJson({
		url: "https://api.elasticemail.com/v4/emails/transactional",
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				"X-ElasticEmail-ApiKey": apiKey,
			},
			body: JSON.stringify(body),
		},
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(record?.TransactionID) ?? asString(record?.MessageID) };
}

async function sendViaEmailit(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "API Key");
	const body: Record<string, unknown> = {
		to: args.message.to.join(", "),
		from: formatAddress(args.message.fromEmail || "", args.message.fromName),
		subject: args.message.subject,
		headers: {
			...(args.message.replyTo?.[0] ? { "reply-to": args.message.replyTo[0] } : {}),
		},
		...(args.message.html
			? { html: args.message.html, text: getMessageText(args.message) }
			: { text: args.message.text }),
	};
	const { json } = await requestJson({
		url: "https://api.emailit.com/v1/emails",
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(body),
		},
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(record?.id) ?? asString(record?.message_id) };
}

async function sendViaGenericSmtp(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const smtpSend = ensureSmtp(args.runtime);
	const host = requireString(args.settings, "host", "SMTP Hostname");
	const port = numberValue(args.settings, "port", 587) ?? 587;
	const security = stringValue(args.settings, "security") ?? "starttls";
	return smtpSend(
		{
			host,
			port,
			secure: security === "ssl",
			username: stringValue(args.settings, "username"),
			password: stringValue(args.settings, "password"),
		},
		args.message,
	);
}

async function resolveGoogleAccessToken(args: ProviderSendArgs, forceRefresh = false): Promise<string> {
	const storedAccessToken = forceRefresh ? undefined : stringValue(args.settings, "accessToken");
	if (storedAccessToken) return storedAccessToken;
	if (!hasAllSettings(args.settings, ["clientId", "clientSecret", "refreshToken"])) {
		throw new Error("Google requires an access token or client ID, client secret, and refresh token.");
	}
	return refreshProviderAccessToken(
		args,
		"https://oauth2.googleapis.com/token",
		new URLSearchParams({
			client_id: requireString(args.settings, "clientId", "Client ID"),
			client_secret: requireString(args.settings, "clientSecret", "Client Secret"),
			refresh_token: requireString(args.settings, "refreshToken", "Refresh Token"),
			grant_type: "refresh_token",
		}),
		"Google",
	);
}

async function resolveMicrosoftAccessToken(args: ProviderSendArgs, forceRefresh = false): Promise<string> {
	const storedAccessToken = forceRefresh ? undefined : stringValue(args.settings, "accessToken");
	if (storedAccessToken) return storedAccessToken;
	if (!hasAllSettings(args.settings, ["clientId", "clientSecret", "refreshToken"])) {
		throw new Error("Microsoft requires an access token or application ID, client secret, and refresh token.");
	}
	const tenantId = stringValue(args.settings, "tenantId") ?? "common";
	return refreshProviderAccessToken(
		args,
		`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
		new URLSearchParams({
			client_id: requireString(args.settings, "clientId", "Application ID"),
			client_secret: requireString(args.settings, "clientSecret", "Client Secret"),
			refresh_token: requireString(args.settings, "refreshToken", "Refresh Token"),
			grant_type: "refresh_token",
			scope: "email Mail.Send User.Read profile openid offline_access",
		}),
		"Microsoft",
	);
}

async function resolveZohoAccessToken(args: ProviderSendArgs, forceRefresh = false): Promise<string> {
	const storedAccessToken = forceRefresh ? undefined : stringValue(args.settings, "accessToken");
	if (storedAccessToken) return storedAccessToken;
	if (!hasAllSettings(args.settings, ["clientId", "clientSecret", "refreshToken"])) {
		throw new Error("Zoho requires an access token or client ID, client secret, and refresh token.");
	}
	const body = new URLSearchParams({
		client_id: requireString(args.settings, "clientId", "Client ID"),
		client_secret: requireString(args.settings, "clientSecret", "Client Secret"),
		refresh_token: requireString(args.settings, "refreshToken", "Refresh Token"),
		grant_type: "refresh_token",
	});
	const redirectUri = stringValue(args.settings, "redirectUri");
	if (redirectUri) body.set("redirect_uri", redirectUri);
	return refreshProviderAccessToken(args, "https://accounts.zoho.com/oauth/v2/token", body, "Zoho");
}

async function sendViaGoogle(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const raw = toBase64Url(buildMimeMessage(args.message));
	const sendRequest = async (accessToken: string) => {
		const { json } = await requestJson({
			url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
			runtime: args.runtime,
			init: {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ raw }),
			},
			ok: [200],
		});
		const record = asRecord(json);
		return { remoteMessageId: asString(record?.id) };
	};
	const canRefresh = hasAllSettings(args.settings, ["clientId", "clientSecret", "refreshToken"]);
	try {
		return await sendRequest(await resolveGoogleAccessToken(args));
	} catch (error) {
		if (!canRefresh || !shouldRetryAfterRefresh(error)) throw error;
		return sendRequest(await resolveGoogleAccessToken(args, true));
	}
}

async function sendViaMailchimp(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "API Key");
	const body = {
		key: apiKey,
		message: {
			subject: args.message.subject,
			from_email: args.message.fromEmail,
			...(args.message.fromName ? { from_name: args.message.fromName } : {}),
			to: args.message.to.map((email) => ({ email, type: "to" })),
			...(args.message.html
				? { html: args.message.html, text: getMessageText(args.message) }
				: { text: args.message.text }),
			...(args.message.replyTo?.[0] ? { headers: { "reply-to": args.message.replyTo[0] } } : {}),
		},
	};
	const { json } = await requestJson({
		url: "https://mandrillapp.com/api/1.0/messages/send",
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	});
	const data = Array.isArray(json) ? json[0] : json;
	const record = asRecord(data);
	return { remoteMessageId: asString(record?._id) ?? asString(record?.id) };
}

async function sendViaMailerSend(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "API Key");
	const body: Record<string, unknown> = {
		subject: args.message.subject,
		from: {
			email: args.message.fromEmail,
			...(args.message.fromName ? { name: args.message.fromName } : {}),
		},
		to: args.message.to.map((email) => ({ email })),
		...(args.message.html ? { html: args.message.html } : { text: args.message.text }),
		...(args.message.replyTo?.[0] ? { reply_to: { email: args.message.replyTo[0] } } : {}),
	};
	const { json } = await requestJson({
		url: "https://api.mailersend.com/v1/email",
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(body),
		},
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(record?.message_id) ?? asString(record?.id) };
}

async function sendViaMailgun(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "Mailgun API Key");
	const domain = requireString(args.settings, "domain", "Sending Domain");
	const region = stringValue(args.settings, "region") ?? "us";
	const base = region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
	const body = new URLSearchParams({
		from: formatAddress(args.message.fromEmail || "", args.message.fromName),
		to: args.message.to.join(", "),
		subject: args.message.subject,
		...(args.message.html ? { html: args.message.html } : {}),
		text: getMessageText(args.message),
	});
	if (args.message.replyTo?.[0]) body.set("h:Reply-To", args.message.replyTo[0]);
	const basic = toBase64(new TextEncoder().encode(`api:${apiKey}`));
	const { json } = await requestJson({
		url: `${base}/${domain}/messages`,
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: { Authorization: `Basic ${basic}` },
			body: body,
		},
		ok: [200],
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(record?.id) };
}

async function sendViaMailjet(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "API Key");
	const apiSecret = requireString(args.settings, "apiSecret", "API Secret Key");
	const body = {
		Messages: [
			{
				To: args.message.to.map((email) => ({ Email: email })),
				From: {
					Email: args.message.fromEmail,
					...(args.message.fromName ? { Name: args.message.fromName } : {}),
				},
				Subject: args.message.subject,
				...(args.message.html
					? { HTMLPart: args.message.html, TextPart: getMessageText(args.message) }
					: { TextPart: args.message.text }),
				...(args.message.replyTo?.[0]
					? { Headers: { "Reply-To": args.message.replyTo[0] } }
					: {}),
			},
		],
	};
	const basic = toBase64(new TextEncoder().encode(`${apiKey}:${apiSecret}`));
	const { json } = await requestJson({
		url: "https://api.mailjet.com/v3.1/send",
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				Authorization: `Basic ${basic}`,
			},
			body: JSON.stringify(body),
		},
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(getPath(record, "Messages", 0, "To", 0, "MessageUUID")) };
}

async function sendViaMicrosoft(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const sendRequest = async (accessToken: string) => {
		await requestJson({
			url: "https://graph.microsoft.com/v1.0/me/sendMail",
			runtime: args.runtime,
			ok: [202],
			init: {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					message: {
						subject: args.message.subject,
						body: {
							contentType: args.message.html ? "HTML" : "Text",
							content: args.message.html || args.message.text,
						},
						toRecipients: args.message.to.map((email) => ({ emailAddress: { address: email } })),
						...(args.message.replyTo?.[0]
							? { replyTo: [{ emailAddress: { address: args.message.replyTo[0] } }] }
							: {}),
					},
					saveToSentItems: false,
				}),
			},
		});
		return {};
	};
	const canRefresh = hasAllSettings(args.settings, ["clientId", "clientSecret", "refreshToken"]);
	try {
		return await sendRequest(await resolveMicrosoftAccessToken(args));
	} catch (error) {
		if (!canRefresh || !shouldRetryAfterRefresh(error)) throw error;
		return sendRequest(await resolveMicrosoftAccessToken(args, true));
	}
}

async function sendViaPhpMail(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const sendmailSend = ensureSendmail(args.runtime);
	return sendmailSend(
		{
			sendmailPath: stringValue(args.settings, "sendmailPath") ?? "sendmail",
			fromEmail: args.message.fromEmail || "",
			fromName: args.message.fromName,
		},
		args.message,
	);
}

async function sendViaPostmark(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const serverApiToken = requireString(args.settings, "serverApiToken", "Server API Token");
	const body: Record<string, unknown> = {
		from: formatAddress(args.message.fromEmail || "", args.message.fromName),
		to: args.message.to.join(","),
		subject: args.message.subject,
		textBody: getMessageText(args.message),
		...(args.message.html ? { htmlBody: args.message.html } : {}),
		...(args.message.replyTo?.[0] ? { ReplyTo: args.message.replyTo[0] } : {}),
	};
	const { json } = await requestJson({
		url: "https://api.postmarkapp.com/email",
		runtime: args.runtime,
		ok: [200],
		init: {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"X-Postmark-Server-Token": serverApiToken,
			},
			body: JSON.stringify(body),
		},
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(record?.MessageID) };
}

async function sendViaResend(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "API Key");
	const body: Record<string, unknown> = {
		to: [...args.message.to],
		from: formatAddress(args.message.fromEmail || "", args.message.fromName),
		subject: args.message.subject,
		...(args.message.html
			? { html: args.message.html, text: getMessageText(args.message) }
			: { text: args.message.text }),
		...(args.message.replyTo?.[0] ? { reply_to: args.message.replyTo[0] } : {}),
	};
	const { json } = await requestJson({
		url: "https://api.resend.com/emails",
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(body),
		},
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(record?.id) };
}

async function sendViaSendgrid(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "SendGrid API Key");
	await requestJson({
		url: "https://api.sendgrid.com/v3/mail/send",
		runtime: args.runtime,
		ok: [202],
		init: {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: {
					email: args.message.fromEmail,
					...(args.message.fromName ? { name: args.message.fromName } : {}),
				},
				personalizations: [
					{
						to: args.message.to.map((email) => ({ email })),
					},
				],
				subject: args.message.subject,
				content: [
					{
						type: args.message.html ? "text/html" : "text/plain",
						value: args.message.html || args.message.text,
					},
				],
				...(args.message.replyTo?.length
					? { reply_to_list: args.message.replyTo.map((email) => ({ email })) }
					: {}),
			}),
		},
	});
	return {};
}

async function sendViaSmtp2go(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "API Key");
	const body: Record<string, unknown> = {
		sender: formatAddress(args.message.fromEmail || "", args.message.fromName),
		subject: args.message.subject,
		to: [...args.message.to],
		...(args.message.html ? { html_body: args.message.html } : { text_body: args.message.text }),
	};
	if (args.message.replyTo?.[0]) {
		body.custom_headers = [{ header: "Reply-To", value: args.message.replyTo[0] }];
	}
	const { json } = await requestJson({
		url: "https://api.smtp2go.com/v3/email/send",
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				"X-Smtp2go-Api-Key": apiKey,
			},
			body: JSON.stringify(body),
		},
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(getPath(record, "data", "email_id")) ?? asString(record?.request_id) };
}

async function sendViaSparkpost(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const apiKey = requireString(args.settings, "apiKey", "API Key");
	const accountLocation = stringValue(args.settings, "accountLocation") ?? "us";
	const base = accountLocation === "eu"
		? "https://api.eu.sparkpost.com/api/v1"
		: "https://api.sparkpost.com/api/v1";
	const body: Record<string, unknown> = {
		recipients: args.message.to.map((email) => ({ address: { email } })),
		content: {
			from: {
				email: args.message.fromEmail,
				...(args.message.fromName ? { name: args.message.fromName } : {}),
			},
			subject: args.message.subject,
			...(args.message.html ? { html: args.message.html } : { text: args.message.text }),
			...(args.message.replyTo?.[0] ? { reply_to: args.message.replyTo[0] } : {}),
		},
		options: { transactional: true },
	};
	const { json } = await requestJson({
		url: `${base}/transmissions/`,
		runtime: args.runtime,
		init: {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				Authorization: apiKey,
			},
			body: JSON.stringify(body),
		},
	});
	const record = asRecord(json);
	return { remoteMessageId: asString(getPath(record, "results", "id")) };
}

function getZohoBaseUrl(region: string): string {
	switch (region) {
		case "eu":
			return "https://mail.zoho.eu";
		case "in":
			return "https://mail.zoho.in";
		case "com.au":
			return "https://mail.zoho.com.au";
		case "jp":
			return "https://mail.zoho.jp";
		case "sa":
			return "https://mail.zoho.sa";
		case "ca":
			return "https://mail.zohocloud.ca";
		case "us":
		default:
			return "https://mail.zoho.com";
	}
}

async function sendViaZoho(args: ProviderSendArgs): Promise<{ remoteMessageId?: string }> {
	const accountId = requireString(args.settings, "accountId", "Account ID");
	const region = stringValue(args.settings, "dataCenterRegion") ?? "us";
	const body: Record<string, unknown> = {
		fromAddress: args.message.fromEmail,
		toAddress: args.message.to.join(","),
		subject: args.message.subject,
		content: args.message.html || args.message.text,
		encoding: "UTF-8",
		mailFormat: args.message.html ? "html" : "plaintext",
		...(args.message.replyTo?.[0] ? { replyToAddress: args.message.replyTo[0] } : {}),
	};
	const sendRequest = async (accessToken: string) => {
		const { json } = await requestJson({
			url: `${getZohoBaseUrl(region)}/api/accounts/${accountId}/messages`,
			runtime: args.runtime,
			init: {
				method: "POST",
				headers: {
					Authorization: `Zoho-oauthtoken ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			},
		});
		const record = asRecord(json);
		return {
			remoteMessageId:
				asString(getPath(record, "data", "messageId")) ?? asString(getPath(record, "data", "message_id")),
		};
	};
	const canRefresh = hasAllSettings(args.settings, ["clientId", "clientSecret", "refreshToken"]);
	try {
		return await sendRequest(await resolveZohoAccessToken(args));
	} catch (error) {
		if (!canRefresh || !shouldRetryAfterRefresh(error)) throw error;
		return sendRequest(await resolveZohoAccessToken(args, true));
	}
}

function option(label: string, value: string): { label: string; value: string } {
	return { label, value };
}

function fields(...defs: ProviderFieldDefinition[]): ProviderFieldDefinition[] {
	return defs;
}

export const SMTP_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
	{
		id: "amazon",
		label: "Amazon SES",
		description: "Amazon Simple Email Service using signed AWS API requests.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["*.amazonaws.com"],
		fields: fields(
			{ key: "accessKeyId", label: "Access Key ID", type: "secret", required: true },
			{ key: "secretAccessKey", label: "Secret Access Key", type: "secret", required: true },
			{
				key: "region",
				label: "Region",
				type: "select",
				required: true,
				defaultValue: "us-east-1",
				options: [
					option("US East (N. Virginia)", "us-east-1"),
					option("US East (Ohio)", "us-east-2"),
					option("US West (N. California)", "us-west-1"),
					option("US West (Oregon)", "us-west-2"),
					option("Europe (Ireland)", "eu-west-1"),
					option("Europe (Frankfurt)", "eu-central-1"),
					option("Europe (London)", "eu-west-2"),
					option("Asia Pacific (Sydney)", "ap-southeast-2"),
					option("Asia Pacific (Singapore)", "ap-southeast-1"),
				],
			},
		),
		send: sendViaAmazon,
	},
	{
		id: "brevo",
		label: "Brevo",
		description: "Transactional email via the Brevo SMTP API.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.brevo.com"],
		fields: fields({ key: "apiKey", label: "API Key", type: "secret", required: true }),
		send: sendViaBrevo,
	},
	{
		id: "elastic_email",
		label: "Elastic Email",
		description: "Transactional email via the Elastic Email v4 API.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.elasticemail.com"],
		fields: fields({ key: "apiKey", label: "API Key", type: "secret", required: true }),
		send: sendViaElasticEmail,
	},
	{
		id: "emailit",
		label: "Emailit",
		description: "Transactional email via the Emailit API.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.emailit.com"],
		fields: fields({ key: "apiKey", label: "API Key", type: "secret", required: true }),
		send: sendViaEmailit,
	},
	{
		id: "generic",
		label: "Generic SMTP",
		description: "Custom SMTP server using Nodemailer in the trusted package.",
		availability: { trusted: true, marketplace: false },
		allowedHosts: [],
		fields: fields(
			{ key: "host", label: "SMTP Hostname", type: "text", required: true, placeholder: "smtp.example.com" },
			{ key: "port", label: "SMTP Port", type: "number", required: true, defaultValue: 587 },
			{
				key: "security",
				label: "Encryption",
				type: "select",
				defaultValue: "starttls",
				options: [option("STARTTLS / Auto", "starttls"), option("SSL/TLS", "ssl"), option("None", "none")],
			},
			{ key: "username", label: "Authentication Username", type: "text" },
			{ key: "password", label: "Authentication Password", type: "secret" },
		),
		send: sendViaGenericSmtp,
	},
	{
		id: "google",
		label: "Google / Gmail",
		description: "Gmail API delivery using an access token or refresh-token credentials.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["gmail.googleapis.com", "oauth2.googleapis.com"],
		fields: fields(
			{ key: "accessToken", label: "Access Token", type: "secret" },
			{ key: "refreshToken", label: "Refresh Token", type: "secret" },
			{ key: "clientId", label: "Client ID", type: "text" },
			{ key: "clientSecret", label: "Client Secret", type: "secret" },
		),
		isConfigured: (settings) =>
			Boolean(stringValue(settings, "accessToken")) ||
			hasAllSettings(settings, ["clientId", "clientSecret", "refreshToken"]),
		send: sendViaGoogle,
	},
	{
		id: "mailchimp",
		label: "Mailchimp Transactional",
		description: "Mandrill/Mailchimp Transactional email delivery.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["mandrillapp.com"],
		fields: fields({ key: "apiKey", label: "API Key", type: "secret", required: true }),
		send: sendViaMailchimp,
	},
	{
		id: "mailersend",
		label: "MailerSend",
		description: "Transactional email via the MailerSend API.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.mailersend.com"],
		fields: fields({ key: "apiKey", label: "API Key", type: "secret", required: true }),
		send: sendViaMailerSend,
	},
	{
		id: "mailgun",
		label: "Mailgun",
		description: "Transactional email via the Mailgun Messages API.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.mailgun.net", "api.eu.mailgun.net"],
		fields: fields(
			{ key: "apiKey", label: "Mailgun API Key", type: "secret", required: true },
			{ key: "domain", label: "Sending Domain", type: "text", required: true, placeholder: "mg.example.com" },
			{
				key: "region",
				label: "Region",
				type: "select",
				defaultValue: "us",
				options: [option("US", "us"), option("EU", "eu")],
			},
		),
		send: sendViaMailgun,
	},
	{
		id: "mailjet",
		label: "Mailjet",
		description: "Transactional email via the Mailjet v3.1 API.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.mailjet.com"],
		fields: fields(
			{ key: "apiKey", label: "API Key", type: "secret", required: true },
			{ key: "apiSecret", label: "API Secret Key", type: "secret", required: true },
		),
		send: sendViaMailjet,
	},
	{
		id: "microsoft",
		label: "365 / Outlook",
		description: "Microsoft Graph delivery using an access token or refresh-token credentials.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["graph.microsoft.com", "login.microsoftonline.com"],
		fields: fields(
			{ key: "accessToken", label: "Access Token", type: "secret" },
			{ key: "refreshToken", label: "Refresh Token", type: "secret" },
			{ key: "clientId", label: "Application ID", type: "text" },
			{ key: "clientSecret", label: "Client Secret", type: "secret" },
			{ key: "tenantId", label: "Tenant ID", type: "text", defaultValue: "common", placeholder: "common" },
		),
		isConfigured: (settings) =>
			Boolean(stringValue(settings, "accessToken")) ||
			hasAllSettings(settings, ["clientId", "clientSecret", "refreshToken"]),
		send: sendViaMicrosoft,
	},
	{
		id: "phpmail",
		label: "PHP Mail / local sendmail",
		description: "Local sendmail transport for trusted installs.",
		availability: { trusted: true, marketplace: false },
		allowedHosts: [],
		fields: fields({ key: "sendmailPath", label: "Sendmail Path", type: "text", defaultValue: "sendmail" }),
		send: sendViaPhpMail,
	},
	{
		id: "postmark",
		label: "Postmark",
		description: "Transactional email via the Postmark send email endpoint.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.postmarkapp.com"],
		fields: fields({ key: "serverApiToken", label: "Server API Token", type: "secret", required: true }),
		send: sendViaPostmark,
	},
	{
		id: "resend",
		label: "Resend",
		description: "Transactional email via the Resend API.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.resend.com"],
		fields: fields({ key: "apiKey", label: "API Key", type: "secret", required: true }),
		send: sendViaResend,
	},
	{
		id: "sendgrid",
		label: "SendGrid",
		description: "Transactional email via Twilio SendGrid.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.sendgrid.com"],
		fields: fields({ key: "apiKey", label: "SendGrid API Key", type: "secret", required: true }),
		send: sendViaSendgrid,
	},
	{
		id: "smtp2go",
		label: "SMTP2GO",
		description: "Transactional email via SMTP2GO's HTTP API.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.smtp2go.com"],
		fields: fields({ key: "apiKey", label: "API Key", type: "secret", required: true }),
		send: sendViaSmtp2go,
	},
	{
		id: "sparkpost",
		label: "SparkPost",
		description: "Transactional email via the SparkPost Transmissions API.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: ["api.sparkpost.com", "api.eu.sparkpost.com"],
		fields: fields(
			{
				key: "accountLocation",
				label: "Account Location",
				type: "select",
				defaultValue: "us",
				options: [option("United States", "us"), option("Europe", "eu")],
			},
			{ key: "apiKey", label: "API Key", type: "secret", required: true },
		),
		send: sendViaSparkpost,
	},
	{
		id: "zoho",
		label: "Zoho Mail",
		description: "Zoho Mail API delivery using an access token or refresh-token credentials.",
		availability: { trusted: true, marketplace: true },
		allowedHosts: [
			"mail.zoho.com",
			"mail.zoho.eu",
			"mail.zoho.in",
			"mail.zoho.com.au",
			"mail.zoho.jp",
			"mail.zoho.sa",
			"mail.zohocloud.ca",
			"accounts.zoho.com",
		],
		fields: fields(
			{
				key: "dataCenterRegion",
				label: "Datacenter Region",
				type: "select",
				defaultValue: "us",
				options: [
					option("United States", "us"),
					option("Europe", "eu"),
					option("India", "in"),
					option("Australia", "com.au"),
					option("Japan", "jp"),
					option("Saudi Arabia", "sa"),
					option("Canada", "ca"),
				],
			},
			{ key: "clientId", label: "Client ID", type: "text" },
			{ key: "clientSecret", label: "Client Secret", type: "secret" },
			{ key: "refreshToken", label: "Refresh Token", type: "secret" },
			{ key: "accessToken", label: "Access Token", type: "secret" },
			{ key: "redirectUri", label: "Redirect URI", type: "text", placeholder: "Optional unless required by your token setup" },
			{ key: "accountId", label: "Account ID", type: "text", required: true },
		),
		isConfigured: (settings) =>
			Boolean(stringValue(settings, "accountId")) &&
			(Boolean(stringValue(settings, "accessToken")) ||
				hasAllSettings(settings, ["clientId", "clientSecret", "refreshToken"])),
		send: sendViaZoho,
	},
];

export function getProviderById(providerId: string): ProviderDefinition | undefined {
	return SMTP_PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId);
}

export function isProviderAvailable(provider: ProviderDefinition, variant: PluginVariant): boolean {
	return provider.availability[variant];
}

export function isProviderConfigured(
	provider: ProviderDefinition,
	settings: Record<string, unknown>,
): boolean {
	if (provider.isConfigured) {
		return provider.isConfigured(settings);
	}
	return provider.fields.every((field) => {
		if (!field.required) return true;
		if (field.type === "number") return numberValue(settings, field.key) !== undefined;
		if (field.type === "toggle") return settings[field.key] !== undefined;
		return Boolean(stringValue(settings, field.key));
	});
}

export function getProviderLabel(providerId: string | undefined): string {
	if (!providerId) return "Not configured";
	return getProviderById(providerId)?.label ?? providerId;
}

export function getAvailableProviderSelectOptions(variant: PluginVariant): Array<{ label: string; value: string }> {
	return SMTP_PROVIDER_DEFINITIONS.filter((provider) => isProviderAvailable(provider, variant)).map((provider) => ({
		label: provider.label,
		value: provider.id,
	}));
}

export function getProviderPickerOptions(variant: PluginVariant): Array<{ label: string; value: string }> {
	return SMTP_PROVIDER_DEFINITIONS.map((provider) => ({
		label: isProviderAvailable(provider, variant) ? provider.label : `${provider.label} (trusted-only)`,
		value: provider.id,
	}));
}

export function collectAllowedHosts(variant: PluginVariant): string[] {
	return unique(
		SMTP_PROVIDER_DEFINITIONS.filter((provider) => isProviderAvailable(provider, variant)).flatMap(
			(provider) => provider.allowedHosts,
		),
	);
}
