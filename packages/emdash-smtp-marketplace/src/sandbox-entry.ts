import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

import {
	createDeliveryLogRecord,
	deliverWithConfiguredProvider,
	handleAdminInteraction,
	isDeliveryReady,
	SMTP_ADMIN_PAGES,
	SMTP_ADMIN_WIDGETS,
	SMTP_PLUGIN_ID,
	SMTP_PLUGIN_VERSION,
	type AdminInteraction,
	type DeliveryRuntime,
	type SmtpPluginContextLike,
	writeDeliveryLog,
} from "emdash-smtp-core";

function createMarketplaceRuntime(ctx: PluginContext): DeliveryRuntime {
	return {
		variant: "marketplace",
		fetch: ctx.http ? (url, init) => ctx.http!.fetch(url, init) : undefined,
	};
}

interface MarketplaceEmailDeliverEvent {
	message: {
		to: string;
		subject: string;
		text: string;
		html?: string;
	};
	source: string;
}

export default definePlugin({
	hooks: {
		"email:deliver": {
			exclusive: true,
			handler: async (event: MarketplaceEmailDeliverEvent, ctx: PluginContext) => {
				const source = event.source || ctx.plugin.id;
				try {
					const result = await deliverWithConfiguredProvider({
						ctx: ctx as unknown as SmtpPluginContextLike,
						runtime: createMarketplaceRuntime(ctx),
						message: event.message,
						source,
					});
					await writeDeliveryLog(
						ctx as unknown as SmtpPluginContextLike,
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
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					await writeDeliveryLog(
						ctx as unknown as SmtpPluginContextLike,
						createDeliveryLogRecord({
							providerId: "unknown",
							status: "failed",
							message: {
								to: event.message.to,
								subject: event.message.subject,
							},
							source,
							durationMs: 0,
							errorMessage: err.message,
						}),
					);
					throw err;
				}
			},
		},
		"email:status": {
			handler: async (_event: unknown, ctx: PluginContext) =>
				isDeliveryReady({
					ctx: ctx as unknown as SmtpPluginContextLike,
					runtime: createMarketplaceRuntime(ctx),
				}),
		},
	},
	routes: {
		admin: {
			handler: (async (
				routeCtx: { input: unknown; request: unknown },
				ctx: PluginContext,
			) => {
				return handleAdminInteraction({
					ctx: ctx as unknown as SmtpPluginContextLike,
					variant: "marketplace",
					runtime: createMarketplaceRuntime(ctx),
					interaction: (routeCtx.input ?? { type: "page_load", page: "/providers" }) as AdminInteraction,
				});
			}) as never,
		},
	},
});
