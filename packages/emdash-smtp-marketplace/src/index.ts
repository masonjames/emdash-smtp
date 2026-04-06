import type { PluginDescriptor } from "emdash";

import {
	collectAllowedHosts,
	SMTP_ADMIN_PAGES,
	SMTP_ADMIN_WIDGETS,
	SMTP_PLUGIN_ID,
	SMTP_PLUGIN_VERSION,
} from "emdash-smtp-core";

export const SMTP_MARKETPLACE_PLUGIN_ID = SMTP_PLUGIN_ID;

export function emdashSmtpMarketplace(): PluginDescriptor {
	return {
		id: SMTP_MARKETPLACE_PLUGIN_ID,
		version: SMTP_PLUGIN_VERSION,
		format: "standard",
		entrypoint: "emdash-smtp-marketplace/sandbox",
		capabilities: ["email:provide", "network:fetch"],
		allowedHosts: collectAllowedHosts("marketplace"),
		storage: {
			deliveryLogs: {
				indexes: ["providerId", "status", "createdAt", "source"],
			},
		},
		adminPages: [...SMTP_ADMIN_PAGES],
		adminWidgets: [...SMTP_ADMIN_WIDGETS],
	};
}
