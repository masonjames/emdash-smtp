# EmDash SMTP — sandbox distribution

Requires EmDash 1.0.1 or newer and a configured sandbox runner.

Install **SMTP** by `@masonjames.com` from the [EmDash plugin registry](https://plugins.emdashcms.com). Open Plugins → SMTP Providers, save your provider credentials and default sender, then select SMTP as the email transport in EmDash email settings. Send a test email to verify your provider configuration. No frontend companion is required.

The sandbox distribution supports HTTP API and OAuth providers. It cannot open arbitrary TCP sockets or run local sendmail. Use the public `emdash-smtp` npm package for generic SMTP servers and sendmail.

Choose one SMTP distribution per site. Registry installations have a separate publisher-scoped identity and do not import npm settings or delivery logs automatically.

## Code-managed sandbox registration

The `emdashSmtpMarketplace()` factory remains available from this npm package. Register it in `sandboxed` with your site's sandbox runner. The npm plugin ID is `emdash-smtp`; do not activate a registry installation at the same time. This release's sandbox log collection uses the current valid name `delivery_logs` rather than the older `deliveryLogs`; old entries are retained but not imported.

## Verification and publication

From the workspace root:

```sh
pnpm release:check
pnpm exec emdash-plugin login masonjames.com
pnpm publish:marketplace
```

The pinned plugin CLI builds a self-contained artifact, validates permissions, publishes its bundle and listing images to the publisher PDS, and writes immutable release records. Directory visibility follows registry approval.

The production sandbox test verifies provider setup, secret redaction, captured HTTP delivery, persistent logs, private admin access and Block Kit pages/widgets. Its use of the official test host is also demonstrated by [Charl Kruger's EmDash Forms](https://github.com/charl-kruger/emdash-forms).
