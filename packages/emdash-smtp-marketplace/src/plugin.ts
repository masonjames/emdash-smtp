import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

import {
	createDeliveryLogRecord,
	deliverWithConfiguredProvider,
	handleAdminInteraction,
	type DeliveryRuntime,
	type SmtpPluginContextLike,
	writeDeliveryLog,
} from "../../core/src/index.js";

function sharedContext(ctx: PluginContext): SmtpPluginContextLike {
	return { ...ctx, storage: { deliveryLogs: ctx.storage.delivery_logs } } as unknown as SmtpPluginContextLike;
}

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

const plugin: SandboxedPlugin = {
	hooks: {
		"email:deliver": {
			exclusive: true,
			handler: async (event: MarketplaceEmailDeliverEvent, ctx: PluginContext) => {
				const source = event.source || ctx.plugin.id;
				try {
					const result = await deliverWithConfiguredProvider({
						ctx: sharedContext(ctx),
						runtime: createMarketplaceRuntime(ctx),
						message: event.message,
						source,
					});
					await writeDeliveryLog(
						sharedContext(ctx),
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
						sharedContext(ctx),
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
	},
	routes: {
		admin: {
			handler: async (routeCtx, ctx) => {
				return handleAdminInteraction({
					ctx: sharedContext(ctx),
					variant: "marketplace",
					runtime: createMarketplaceRuntime(ctx),
					interaction: routeCtx.input,
				});
			},
		},
	},
};

export default plugin;
