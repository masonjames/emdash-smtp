# EmDash SMTP

`emdash-smtp` is a production-oriented email delivery plugin family for EmDash split into two install targets:

- `emdash-smtp` — trusted/npm install for full provider parity, including generic SMTP and local sendmail
- `emdash-smtp-marketplace` — marketplace-safe companion package for the same EmDash SMTP product

Both distributions identify as `emdash-smtp` in npm configuration. Registry installations use a publisher-scoped identity. Requires EmDash 1.0.1 or later. Choose one distribution per site. Registry installs do not import npm settings or logs automatically.

> Legacy package names under `@masonjames/*` are deprecated. Use the unscoped package names in this README.

## Trusted install from npm

Use the trusted package when you control the codebase and want the full provider set.

```bash
pnpm add emdash-smtp
```

```ts
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { emdashSmtp } from "emdash-smtp";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [emdashSmtp()],
    }),
  ],
});
```

## Marketplace publication and sandboxed installs

Install **SMTP** by `@masonjames.com` from the [EmDash plugin registry](https://plugins.emdashcms.com). No frontend companion is required. Configure a provider and sender in Plugins → SMTP Providers, then select SMTP as the email transport in EmDash email settings.

For code-managed sandbox registration, the existing npm factory remains available:

```bash
pnpm add emdash-smtp-marketplace
```

```ts
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { emdashSmtpMarketplace } from "emdash-smtp-marketplace";

export default defineConfig({
  integrations: [
    emdash({
      sandboxRunner: "@emdash-cms/cloudflare/sandbox",
      sandboxed: [emdashSmtpMarketplace()],
    }),
  ],
});
```

The marketplace release stays on the official EmDash CLI path:

```bash
pnpm validate:marketplace
pnpm bundle:marketplace
pnpm publish:marketplace
```

These commands use the pinned `@emdash-cms/plugin-cli` 0.13.1. Authenticate with `pnpm exec emdash-plugin login masonjames.com`. Direct publication uploads the bundle and icon to the publisher’s PDS; public listing follows registry approval.

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

Supported install targets:

- `packages/emdash-smtp` — trusted EmDash plugin package
- `packages/emdash-smtp-marketplace` — marketplace-safe EmDash plugin package

Implementation packages published to satisfy dependency resolution:

- `packages/core` — shared provider catalog, settings storage, Block Kit admin builders, delivery engine used by both public packages
- `packages/node-transports` — trusted-only SMTP/sendmail adapters used by `emdash-smtp`

Documentation and runbooks:

- `docs/` — PRD, architecture notes, provider matrix, install/publish runbooks

## Local development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Release workflow

Run the full verification pass:

```bash
pnpm release:check
```

Dry-run npm publication in package order:

```bash
pnpm publish:npm -- --dry-run
```

Publish the npm packages:

```bash
pnpm publish:npm
```

The npm publisher uses existing npm auth when present, or reads the `NPM TOKEN` credential from 1Password into a temporary npm config.

Deprecate the legacy scoped package names:

```bash
pnpm deprecate:legacy
```

Publish the marketplace build:

```bash
pnpm publish:marketplace
```

## Documentation

- [PRD](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Provider Matrix](docs/PROVIDER-MATRIX.md)
- [Installation Guide](docs/INSTALLATION.md)
- [Publishing Guide](docs/PUBLISHING.md)
- [Release Runbook](docs/RELEASE.md)

## Status

This repo is structured for:

- unscoped npm publication
- trusted EmDash installation from npm via `astro.config.mjs`
- registry publication of the sandbox-safe companion via `emdash-plugin publish`
- CI validation for build, typecheck, tests, marketplace validation, and marketplace bundling

## Inspiration

The official EmDash sandbox integration tests also appear in [Charl Kruger’s EmDash Forms](https://github.com/charl-kruger/emdash-forms). That project demonstrates the integration boundary we support: forms send notifications through `ctx.email.send()`, and SMTP supplies the email transport. SMTP’s sandbox tests capture provider requests locally rather than sending live email.
