# `@masonjames/emdash-smtp-marketplace`

Marketplace-safe EmDash SMTP plugin package.

This package is designed for `emdash plugin bundle` / `emdash plugin publish` and for sandbox-compatible installs where delivery happens through HTTP API and OAuth-based providers. It publishes the same EmDash SMTP plugin identity (`emdash-smtp`) in standard/sandboxed form.

## Includes

- marketplace-safe standard plugin descriptor
- sandbox entrypoint for EmDash marketplace bundles
- Block Kit admin pages for provider settings and delivery logs
- HTTP API and OAuth-capable provider coverage for the sandbox-safe EmDash SMTP package

## Direct config install

```bash
pnpm add @masonjames/emdash-smtp-marketplace
```

```ts
import { defineConfig } from "astro/config";
import { emdash } from "emdash/astro";
import { emdashSmtpMarketplace } from "@masonjames/emdash-smtp-marketplace";

export default defineConfig({
  integrations: [
    emdash({
      sandboxRunner: "@emdash-cms/cloudflare/sandbox",
      sandboxed: [emdashSmtpMarketplace()],
    }),
  ],
});
```

## Marketplace publishing

```bash
pnpm build
pnpm bundle:marketplace
pnpm publish:marketplace
```

## Limits of the sandbox variant

The marketplace-safe package intentionally excludes trusted-only transports:

- Generic SMTP
- local sendmail / PHP mail analogue

Use `@masonjames/emdash-smtp` instead when those transports are required.

## Plugin ID

The marketplace distribution uses the same EmDash plugin ID as the trusted package:

- `emdash-smtp`

Do not install both variants on the same site at the same time.
