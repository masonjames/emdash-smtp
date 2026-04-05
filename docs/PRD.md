# Product Requirements Document

## Product

EmDash SMTP is a production-ready email delivery plugin family for EmDash split into trusted and marketplace-safe variants.

## Goals

- Provide the full EmDash SMTP provider catalog.
- Support both first-party trusted installs and marketplace publication.
- Give administrators a usable Block Kit configuration surface inside EmDash.
- Support primary and fallback delivery providers.
- Persist delivery logs for support and troubleshooting.

## Non-Goals

- Replicating another product’s UI one-for-one.
- Providing custom React admin UI in the marketplace package.
- Implementing vendor OAuth onboarding flows outside what can be configured through stored credentials.

## Variants

### Trusted package

- Package: `emdash-smtp`
- Plugin ID: `emdash-smtp`
- Install path: npm + `astro.config.mjs`
- Includes trusted-only transports such as Generic SMTP and local sendmail

### Marketplace package

- Package: `emdash-smtp-marketplace`
- Plugin ID: `emdash-smtp`
- Install path: EmDash marketplace bundle / publish flow
- Limited to providers that work in sandboxed execution
- Uses the same public plugin identity as the trusted package

## Core user stories

- As a site owner, I can pick an email provider and configure its credentials inside EmDash.
- As a site owner, I can send a test email while saving provider settings.
- As a site owner, I can define a primary provider and a fallback provider.
- As a site owner, I can inspect recent delivery logs from the plugin admin page.
- As a plugin maintainer, I can publish the marketplace-safe package with `emdash plugin publish`.
- As a first-party maintainer, I can install the trusted package from npm in `astro.config.mjs`.

## Functional requirements

- Shared provider catalog across trusted and marketplace variants
- Provider-specific settings fields
- Provider delivery handlers for HTTP APIs, OAuth-based APIs, Generic SMTP, and local sendmail
- Block Kit admin pages for:
  - Providers
  - Logs
- Dashboard widget showing provider/log status
- Persistent KV settings storage
- Persistent delivery log storage collection
- Test-send support from the provider form
- Fallback delivery on primary failure
- Distinct trusted and marketplace package metadata

## Quality requirements

- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm build` passes
- Marketplace package validates and bundles successfully through the EmDash CLI
- npm packages expose built `dist/` entrypoints instead of raw TypeScript source

## Release requirements

- Public unscoped package names
- Trusted npm install documented with a working `astro.config.mjs` snippet
- Marketplace publication documented through `emdash plugin publish`
- Repository metadata and README files for both install targets
- Marketplace icon asset
- CI for build, typecheck, test, marketplace validation, and marketplace bundling

## Success criteria

- Trusted package can be imported from `astro.config.mjs`
- Marketplace package can be bundled into a valid EmDash plugin tarball
- Admins can configure providers, send a test email, and inspect logs without leaving EmDash
