# `emdash-smtp`

Trusted installation of the EmDash SMTP plugin family.

Use this package when you need the full EmDash SMTP feature set, including transports that cannot run in the EmDash marketplace sandbox.

## Includes

- full shared provider catalog
- generic SMTP
- provider-specific SMTP-style setups where a raw transport is required
- local sendmail / PHP mail analogue
- Block Kit admin pages for providers and logs
- delivery fallback support

## Install

```bash
pnpm add emdash-smtp
```

## Register in `astro.config.mjs`

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

## When to use this package

Choose the trusted package if you need any of the following:

- Generic SMTP
- local sendmail delivery
- maximum provider compatibility on Node deployments
- first-party control via npm and source review

## Do not install both variants together

Choose one runtime path per site:

- `emdash-smtp` for trusted/npm installs
- `emdash-smtp-marketplace` for marketplace or sandbox installs
- both distributions identify as `emdash-smtp` inside EmDash

If you need a user-installable marketplace listing and a first-party npm install path, publish both packages as a split pair.
