# Release Runbook

This runbook prepares the initial GitHub release, publishes the npm packages, and publishes the marketplace build for EmDash SMTP.

## Assumptions

- GitHub repository: `https://github.com/masonjames/emdash-smtp.git`
- Trusted npm package: `emdash-smtp`
- Marketplace package directory: `packages/emdash-smtp-marketplace`
- EmDash plugin ID: `emdash-smtp`
- EmDash CLI is available through one of:
  - `EMDASH_CLI_PATH`
  - an installed EmDash package that exposes its CLI
  - a sibling `../emdash` checkout with `packages/core/dist/cli/index.mjs`

## 1. Verify the workspace

```bash
pnpm release:check
pnpm publish:npm -- --dry-run
```

## 2. Prepare GitHub

If the repository has not been connected yet:

```bash
git branch -M main
git remote add origin https://github.com/masonjames/emdash-smtp.git
```

If `origin` already exists:

```bash
git remote set-url origin https://github.com/masonjames/emdash-smtp.git
```

Stage, commit, and push:

```bash
git add .
git status --short
git commit -m "feat: initial EmDash SMTP release"
git push -u origin main
```

Tag the release after the publish-ready commit is on `main`:

```bash
git tag v0.2.0
git push origin v0.2.0
```

## 3. Publish npm packages

Publish the npm packages in dependency order:

```bash
pnpm publish:npm
```

If a package fails after earlier packages were already published, resume from the first unpublished package:

```bash
pnpm publish:npm -- --from <first-unpublished-package>
```

Valid package names are:

- `emdash-smtp-core`
- `emdash-smtp-node-transports`
- `emdash-smtp`
- `emdash-smtp-marketplace`

Deprecate the legacy scoped package names after the unscoped publish is confirmed:

```bash
pnpm deprecate:legacy
```

## 4. Publish to the EmDash marketplace

Authenticate if needed:

```bash
node scripts/run-marketplace-cli.mjs plugin login
```

Publish the marketplace distribution:

```bash
pnpm publish:marketplace
```

If interactive auth cannot start, verify the marketplace registry returns `github.clientId` from `/api/v1/auth/discovery` or use `EMDASH_MARKETPLACE_TOKEN`.

Equivalent direct CLI command:

```bash
node scripts/run-marketplace-cli.mjs plugin publish --dir packages/emdash-smtp-marketplace --build
```

## 5. Post-publish checks

Verify:

- `pnpm add emdash-smtp` installs cleanly in a separate project.
- `pnpm add emdash-smtp-marketplace` installs cleanly in a separate sandboxed test project.
- `@masonjames/emdash-smtp*` package pages warn and point to the new unscoped package names.
- the trusted package registers in `astro.config.mjs` with `plugins: [emdashSmtp()]`.
- the marketplace listing appears as **EmDash SMTP**.
- the marketplace listing shows the icon, screenshots, README, and expected capabilities.
- a test email succeeds from the EmDash SMTP provider screen.
- trusted installs and sandboxed installs are not both enabled on the same site.
