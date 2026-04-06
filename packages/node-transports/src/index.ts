import nodemailer from "nodemailer";

import type {
	DeliveryMessage,
	LocalRuntimeTransportConfig,
	SmtpRuntimeTransportConfig,
} from "emdash-smtp-core";

function formatSender(message: DeliveryMessage): string {
	if (!message.fromEmail) {
		throw new Error("A sender email is required for trusted delivery transports.");
	}
	return message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail;
}

export async function smtpSend(
	config: SmtpRuntimeTransportConfig,
	message: DeliveryMessage,
): Promise<{ remoteMessageId?: string }> {
	const transporter = nodemailer.createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure,
		auth:
			config.username || config.password
				? {
						user: config.username,
						pass: config.password,
					}
				: undefined,
	});

	const result = await transporter.sendMail({
		from: formatSender(message),
		to: message.to.join(", "),
		subject: message.subject,
		text: message.text,
		html: message.html,
		replyTo: message.replyTo?.join(", "),
	});

	return { remoteMessageId: result.messageId };
}

export async function sendmailSend(
	config: LocalRuntimeTransportConfig,
	message: DeliveryMessage,
): Promise<{ remoteMessageId?: string }> {
	const transporter = nodemailer.createTransport({
		sendmail: true,
		newline: "unix",
		path: config.sendmailPath || "sendmail",
	});

	const result = await transporter.sendMail({
		from: config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail,
		to: message.to.join(", "),
		subject: message.subject,
		text: message.text,
		html: message.html,
		replyTo: message.replyTo?.join(", "),
	});

	return { remoteMessageId: result.messageId };
}
