# EmDash SMTP

`emdash-smtp` is a production-oriented email delivery plugin family for EmDash split into two install targets:

- `@masonjames/emdash-smtp` — trusted/native install for full provider parity, including generic SMTP and local sendmail
- `@masonjames/emdash-smtp-marketplace` — marketplace-safe standard plugin package for the same EmDash SMTP product

The split follows EmDash’s plugin model:

- trusted plugins are installed from npm and registered in `astro.config.mjs`
- sandboxed installs require a configured `sandboxRunner`
- marketplace plugins are bundled with `emdash plugin bundle` and published with `emdash plugin publish`
- both distributions identify as the same plugin in EmDash: `emdash-smtp`

## Provider coverage

The current provider catalog includes:

- Amazon SES
- Brevo
- Elastic Email
- Emailit
- Generic SMTP
- Google / Gmail
- Mailchimp Transactional
- MailerSend
- Mailgun
- Mailjet
- Microsoft
- PHP Mail analogue / local sendmail
- Postmark
- Resend
- SendGrid
- SMTP2GO
- SparkPost
- Zoho

See [`docs/PROVIDER-MATRIX.md`](docs/PROVIDER-MATRIX.md) for trusted vs marketplace availability.

OAuth-backed providers (Google / Gmail, Microsoft 365 / Outlook, and Zoho Mail) support either a direct access token or a client credential + refresh token set. When refresh credentials are present, EmDash SMTP refreshes access tokens during delivery instead of requiring manual token rotation.

## Repository layout

- `packages/core` — shared provider catalog, settings storage, Block Kit admin builders, delivery engine
- `packages/node-transports` — trusted-only SMTP/sendmail adapters
- `packages/emdash-smtp` — trusted EmDash plugin package
- `packages/emdash-smtp-marketplace` — marketplace-safe EmDash plugin package
- `docs/` — PRD, architecture notes, provider matrix, install/publish runbooks

## Local development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Marketplace verification

Validate or bundle the marketplace-safe package:

```bash
pnpm validate:marketplace
pnpm bundle:marketplace
```

Publish after authenticating with EmDash:

```bash
pnpm publish:marketplace
```

The helper script at `scripts/run-emdash-cli.mjs` resolves the EmDash CLI in this order:

1. `EMDASH_CLI_PATH`
2. an installed EmDash package that exposes the CLI
3. a sibling `../emdash` workspace checkout

## Documentation

- [PRD](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Provider Matrix](docs/PROVIDER-MATRIX.md)
- [Installation Guide](docs/INSTALLATION.md)
- [Publishing Guide](docs/PUBLISHING.md)
- [Release Runbook](docs/RELEASE.md)

## Status

This repo is structured for:

- scoped npm publication under `@masonjames`
- trusted EmDash installation from npm
- marketplace publication of the sandbox-safe companion
- CI validation for build, typecheck, and tests
