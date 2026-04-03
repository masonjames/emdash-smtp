# Architecture

## Workspace structure

- `packages/core`
  - shared provider catalog
  - settings storage helpers
  - Block Kit admin page builders
  - delivery engine
- `packages/node-transports`
  - trusted-only runtime adapters for SMTP and sendmail
- `packages/emdash-smtp`
  - trusted descriptor factory
  - trusted plugin runtime entry
- `packages/emdash-smtp-marketplace`
  - marketplace descriptor factory
  - sandbox runtime entry

## Delivery model

1. EmDash invokes the plugin’s exclusive `email:deliver` hook
2. The plugin resolves global settings
3. The plugin selects the active provider
4. The message is normalized with default sender settings
5. Delivery runs through the provider-specific handler
6. If the active provider fails and a fallback provider is configured, delivery retries once through the fallback
7. A delivery log record is persisted according to the configured log level

## Storage model

### KV

- global settings
- provider settings per provider ID
- last test-send result per provider

### Collection storage

- `deliveryLogs`
  - indexes: `providerId`, `status`, `createdAt`, `source`

## Admin UI model

The plugin uses Block Kit so the marketplace-safe package remains compatible with EmDash sandbox constraints.

### Pages

- `/providers`
  - global defaults
  - provider selector
  - provider-specific settings
  - test send
  - secret-clear actions
- `/logs`
  - recent delivery log table

### Widget

- `smtp-overview`
  - active provider
  - sent count
  - failed count

## Security model

### Trusted

- runs in-process
- may use Node adapters
- suited for Generic SMTP and local sendmail

### Marketplace

- standard/sandbox-safe format
- uses `ctx.http.fetch()` only
- no Node built-ins in backend bundle
- only providers compatible with sandbox execution are actually usable

## Packaging model

- npm publication ships built `dist/` entrypoints
- marketplace publication bundles the marketplace package into `manifest.json` + `backend.js` (+ assets)
- the workspace helper script resolves the EmDash CLI from either the installed package or a sibling local EmDash repo
