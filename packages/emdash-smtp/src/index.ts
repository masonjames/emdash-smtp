import type { PluginDescriptor } from "emdash";

import {
	collectAllowedHosts,
	SMTP_ADMIN_PAGES,
	SMTP_ADMIN_WIDGETS,
	SMTP_PLUGIN_ID,
	SMTP_PLUGIN_VERSION,
} from "@masonjames/emdash-smtp-core";

export interface EmdashSmtpOptions {
	label?: string;
}

export function emdashSmtp(options: EmdashSmtpOptions = {}): PluginDescriptor<EmdashSmtpOptions> {
	return {
		id: SMTP_PLUGIN_ID,
		version: SMTP_PLUGIN_VERSION,
		entrypoint: "@masonjames/emdash-smtp/plugin",
		options,
		capabilities: ["email:provide", "network:fetch"],
		allowedHosts: collectAllowedHosts("trusted"),
		storage: {
			deliveryLogs: {
				indexes: ["providerId", "status", "createdAt", "source"],
			},
		},
		adminPages: [...SMTP_ADMIN_PAGES],
		adminWidgets: [...SMTP_ADMIN_WIDGETS],
	};
}

export default emdashSmtp;
