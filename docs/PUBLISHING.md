# Publishing Guide

## Packages to publish

Public npm packages in this workspace:

- `@masonjames/emdash-smtp-core`
- `@masonjames/emdash-smtp-node-transports`
- `@masonjames/emdash-smtp`
- `@masonjames/emdash-smtp-marketplace`

Marketplace listing identity:

- package directory: `packages/emdash-smtp-marketplace`
- EmDash plugin ID: `emdash-smtp`

## Preconditions

Before publishing:

1. Bump versions consistently across all package manifests and `SMTP_PLUGIN_VERSION`
2. Confirm npm publish access for the `@masonjames` scope
3. Ensure the EmDash CLI is reachable through one of these paths:
   - `EMDASH_CLI_PATH`
   - an installed EmDash package that exposes its CLI
   - a sibling `../emdash` workspace checkout with `packages/core/dist/cli/index.mjs`
4. Authenticate for marketplace publication with `emdash plugin login` or during `emdash plugin publish`

## Verification

Run the full local verification pass before publishing:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm validate:marketplace
pnpm bundle:marketplace
```

## npm publication

Use `pnpm publish`, not raw `npm publish`, because this workspace uses `workspace:*` dependencies.

Recommended order:

1. `packages/core`
2. `packages/node-transports`
3. `packages/emdash-smtp`
4. `packages/emdash-smtp-marketplace`

Example commands:

```bash
(
  cd packages/core
  pnpm publish --access public
)

(
  cd packages/node-transports
  pnpm publish --access public
)

(
  cd packages/emdash-smtp
  pnpm publish --access public
)

(
  cd packages/emdash-smtp-marketplace
  pnpm publish --access public
)
```

## EmDash marketplace publication

Only the marketplace package goes through the EmDash marketplace flow.

```bash
pnpm validate:marketplace
pnpm bundle:marketplace
pnpm publish:marketplace
```

Equivalent direct CLI flow:

```bash
node scripts/run-emdash-cli.mjs plugin publish --dir packages/emdash-smtp-marketplace --build
```

## Notes

- `emdash plugin publish` registers the plugin automatically the first time if the plugin ID does not exist yet.
- Marketplace publication requires a strictly increasing semver version.
- This repository does not store npm credentials or marketplace auth tokens.
- Use `docs/RELEASE.md` for the full GitHub + npm + marketplace runbook.
