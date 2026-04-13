# `emdash-smtp-marketplace`

Marketplace-safe EmDash SMTP plugin package.

This package is designed for `emdash plugin bundle` / `emdash plugin publish` and for sandbox-compatible installs where delivery happens through HTTP API and OAuth-based providers. It publishes the same EmDash SMTP plugin identity (`emdash-smtp`) in standard/sandboxed form.

## Includes

- marketplace-safe standard plugin descriptor
- sandbox entrypoint for EmDash marketplace bundles
- Block Kit admin pages for provider settings and delivery logs
- HTTP API and OAuth-capable provider coverage for the sandbox-safe EmDash SMTP package

## Supported usage

Use this package as the source package for EmDash marketplace bundling and publishing:

```bash
pnpm validate:marketplace
pnpm bundle:marketplace
pnpm publish:marketplace
```

That flow ultimately uses `emdash plugin publish --build` for `packages/emdash-smtp-marketplace` and bundles the package's TypeScript entrypoints into the marketplace artifact.

Direct `sandboxed: [emdashSmtpMarketplace()]` registration from this npm package is not the supported path right now; install through the EmDash marketplace or publish a bundled marketplace artifact with the CLI.

## Limits of the sandbox variant

The marketplace-safe package intentionally excludes trusted-only transports:

- Generic SMTP
- local sendmail / PHP mail analogue

Use `emdash-smtp` instead when those transports are required.

## Plugin ID

The marketplace distribution uses the same EmDash plugin ID as the trusted package:

- `emdash-smtp`

Do not install both variants on the same site at the same time.
