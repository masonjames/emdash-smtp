# Publishing Guide

## Supported package surfaces

Supported user-facing install targets:

- `emdash-smtp`
- `emdash-smtp-marketplace`

Implementation packages that are still published automatically to satisfy npm dependency resolution:

- `emdash-smtp-core`
- `emdash-smtp-node-transports`

Marketplace listing identity:

- package directory: `packages/emdash-smtp-marketplace`
- EmDash plugin ID: `emdash-smtp`

## Preconditions

Before publishing:

1. Bump versions consistently across all package manifests and `SMTP_PLUGIN_VERSION`.
2. Confirm npm publish access for the unscoped package names.
3. Ensure the EmDash CLI is reachable through one of these paths:
   - `EMDASH_CLI_PATH`
   - an installed EmDash package that exposes its CLI
   - a sibling `../emdash` workspace checkout with `packages/core/dist/cli/index.mjs`
4. Authenticate for marketplace publication with `emdash plugin login` or during `emdash plugin publish`.

## Verification

Run the full local verification pass before publishing:

```bash
pnpm release:check
```

That runs:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm validate:marketplace`
- `pnpm bundle:marketplace`

## npm publication

Use the root publisher so packages go out in dependency order and can be resumed cleanly.

Dry run:

```bash
pnpm publish:npm -- --dry-run
```

Publish:

```bash
pnpm publish:npm
```

Deprecate the legacy scoped package names after the unscoped publish is live:

```bash
pnpm deprecate:legacy
```

Published order:

1. `packages/core`
2. `packages/node-transports`
3. `packages/emdash-smtp`
4. `packages/emdash-smtp-marketplace`

If publication stops partway through, resume from the first unpublished package:

```bash
pnpm publish:npm -- --from <first-unpublished-package>
```

Valid package names are:

- `emdash-smtp-core`
- `emdash-smtp-node-transports`
- `emdash-smtp`
- `emdash-smtp-marketplace`

## EmDash marketplace publication

Only the marketplace package goes through the EmDash marketplace flow. Its package manifest points at TypeScript source entrypoints (`src/index.ts` and `src/sandbox-entry.ts`); the EmDash CLI bundles those into the marketplace artifact.

```bash
pnpm validate:marketplace
pnpm bundle:marketplace
pnpm publish:marketplace
```

Equivalent direct CLI flow:

```bash
node scripts/run-marketplace-cli.mjs plugin publish --dir packages/emdash-smtp-marketplace --build
```

## Notes

- Legacy package names under `@masonjames/*` should remain deprecated and point users at the supported unscoped install targets.

- `publish:marketplace` uses `emdash plugin publish` under the hood; the marketplace package manifest already points at source entrypoints.
- `emdash plugin publish` registers the plugin automatically the first time if the plugin ID does not exist yet.
- Marketplace publication requires a strictly increasing semver version.
- If interactive marketplace auth fails before a device code is shown, verify the registry discovery response includes `github.clientId` or provide `EMDASH_MARKETPLACE_TOKEN`.
- The CI workflow now relies on the root `packageManager` field via Corepack so pnpm stays single-sourced.
- This repository does not store npm credentials or marketplace auth tokens.
- Use `docs/RELEASE.md` for the full GitHub + npm + marketplace runbook.
