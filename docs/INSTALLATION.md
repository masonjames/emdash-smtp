# Installation Guide

## Trusted installation from npm

Use this path when you control the codebase and want full provider parity.

```bash
pnpm add @masonjames/emdash-smtp
```

```ts
import { defineConfig } from "astro/config";
import { emdash } from "emdash/astro";
import { emdashSmtp } from "@masonjames/emdash-smtp";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [emdashSmtp()],
    }),
  ],
});
```

## Sandboxed installation from code

Use this path when you are developing against a sandbox-compatible environment and want the marketplace-safe descriptor from code.

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

## Installation from the EmDash Marketplace

1. Configure marketplace access and sandbox support for your EmDash deployment
2. Publish the marketplace package for the `emdash-smtp` plugin with `pnpm publish:marketplace`
3. Install **EmDash SMTP** from **Plugins → Marketplace** in EmDash
4. Open the plugin’s **Providers** page and configure the active provider

## Recommended initial providers

- **Resend**: configure an API key and a verified sender domain, then set Resend as the primary provider.
- **Google / Gmail**: configure either a direct access token or a `clientId` + `clientSecret` + `refreshToken` credential set. The plugin refreshes Google access tokens during delivery when refresh credentials are present.
- **Microsoft / Outlook** and **Zoho Mail** follow the same credential model as Google for long-lived OAuth-backed operation.

## Variant selection

- Choose `@masonjames/emdash-smtp` if you need Generic SMTP or local sendmail
- Choose `@masonjames/emdash-smtp-marketplace` if you need an EmDash marketplace install path
- Both variants use the same EmDash plugin ID: `emdash-smtp`
- Do not install both variants at the same time on the same site
