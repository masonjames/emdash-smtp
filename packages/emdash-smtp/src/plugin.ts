import { definePlugin } from "emdash";
import type { PluginContext, ResolvedPlugin } from "emdash";

import {
	collectAllowedHosts,
	createDeliveryLogRecord,
	deliverWithConfiguredProvider,
	handleAdminInteraction,
	SMTP_ADMIN_PAGES,
	SMTP_ADMIN_WIDGETS,
	SMTP_PLUGIN_ID,
	SMTP_PLUGIN_VERSION,
	type AdminInteraction,
	type DeliveryRuntime,
	type SmtpPluginContextLike,
	writeDeliveryLog,
} from "emdash-smtp-core";
import { sendmailSend, smtpSend } from "emdash-smtp-node-transports";

function createTrustedRuntime(ctx: PluginContext): DeliveryRuntime {
	return {
		variant: "trusted",
		fetch: ctx.http ? (url, init) => ctx.http!.fetch(url, init) : undefined,
		smtpSend,
		sendmailSend,
	};
}

interface TrustedEmailDeliverEvent {
	message: {
		to: string;
		subject: string;
		text: string;
		html?: string;
	};
	source: string;
}

async function logSuccessfulDelivery(
	ctx: SmtpPluginContextLike,
	event: TrustedEmailDeliverEvent,
	source: string,
	result: Awaited<ReturnType<typeof deliverWithConfiguredProvider>>,
): Promise<void> {
	await writeDeliveryLog(
		ctx,
		createDeliveryLogRecord({
			providerId: result.providerId,
			status: "sent",
			message: {
				to: event.message.to,
				subject: event.message.subject,
			},
			source,
			durationMs: result.durationMs,
			remoteMessageId: result.remoteMessageId,
		}),
	);
}

async function logFailedDelivery(
	ctx: SmtpPluginContextLike,
	event: TrustedEmailDeliverEvent,
	source: string,
	error: Error,
): Promise<void> {
	await writeDeliveryLog(
		ctx,
		createDeliveryLogRecord({
			providerId: "unknown",
			status: "failed",
			message: {
				to: event.message.to,
				subject: event.message.subject,
			},
			source,
			durationMs: 0,
			errorMessage: error.message,
		}),
	);
}

export function createPlugin(): ResolvedPlugin {
	return definePlugin({
		id: SMTP_PLUGIN_ID,
		version: SMTP_PLUGIN_VERSION,
		capabilities: ["email:provide", "network:fetch"],
		allowedHosts: collectAllowedHosts("trusted"),
		storage: {
			deliveryLogs: {
				indexes: ["providerId", "status", "createdAt", "source"],
			},
		},
		admin: {
			pages: [...SMTP_ADMIN_PAGES],
			widgets: [...SMTP_ADMIN_WIDGETS],
		},
		hooks: {
			"email:deliver": {
				exclusive: true,
				handler: async (event: TrustedEmailDeliverEvent, ctx: PluginContext) => {
					const source = event.source || ctx.plugin.id;
					try {
						const result = await deliverWithConfiguredProvider({
							ctx: ctx as unknown as SmtpPluginContextLike,
							runtime: createTrustedRuntime(ctx),
							message: event.message,
							source,
						});
						await logSuccessfulDelivery(
							ctx as unknown as SmtpPluginContextLike,
							event,
							source,
							result,
						);
					} catch (error) {
						const err = error instanceof Error ? error : new Error(String(error));
						await logFailedDelivery(ctx as unknown as SmtpPluginContextLike, event, source, err);
						throw err;
					}
				},
			},
		},
		routes: {
			admin: {
				handler: (async (
					routeCtx: PluginContext & { input: unknown; request: unknown },
				) => {
					return handleAdminInteraction({
						ctx: routeCtx as unknown as SmtpPluginContextLike,
						variant: "trusted",
						runtime: createTrustedRuntime(routeCtx),
						interaction: (routeCtx.input ?? { type: "page_load", page: "/providers" }) as AdminInteraction,
					});
				}) as never,
			},
		},
	});
}

export default createPlugin;
