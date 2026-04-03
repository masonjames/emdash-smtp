# Provider Matrix

| Provider | Trusted package | Marketplace package | Notes |
| --- | --- | --- | --- |
| Amazon SES | Yes | Yes | HTTP API |
| Brevo | Yes | Yes | HTTP API |
| Elastic Email | Yes | Yes | HTTP API |
| Emailit | Yes | Yes | HTTP API |
| Generic SMTP | Yes | No | Trusted-only raw SMTP transport |
| Google / Gmail | Yes | Yes | Gmail API |
| Mailchimp Transactional | Yes | Yes | Mandrill API |
| MailerSend | Yes | Yes | HTTP API |
| Mailgun | Yes | Yes | HTTP API |
| Mailjet | Yes | Yes | HTTP API |
| Microsoft | Yes | Yes | Microsoft Graph |
| PHP Mail analogue / local sendmail | Yes | No | Trusted-only local transport |
| Postmark | Yes | Yes | HTTP API |
| Resend | Yes | Yes | HTTP API |
| SendGrid | Yes | Yes | HTTP API |
| SMTP2GO | Yes | Yes | HTTP API |
| SparkPost | Yes | Yes | HTTP API |
| Zoho | Yes | Yes | Zoho Mail API |

## Notes

- The marketplace package surfaces the full catalog in the UI so the split-variant story is clear to users.
- Trusted-only transports are marked as unavailable when the marketplace package is installed.
- The trusted package is the authoritative install target when Generic SMTP or local delivery is required.
- Google / Gmail, Microsoft 365 / Outlook, and Zoho Mail accept either a direct access token or a client credential + refresh token set.
- The marketplace allowlist includes both provider API hosts and OAuth token hosts required for access-token refresh flows.
