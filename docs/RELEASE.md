# Release Runbook

This runbook prepares the initial GitHub release, publishes the npm packages, and publishes the marketplace build for EmDash SMTP.

## Assumptions

- GitHub repository: `https://github.com/masonjames/emdash-smtp.git`
- npm scope: `@masonjames`
- Marketplace package directory: `packages/emdash-smtp-marketplace`
- EmDash plugin ID: `emdash-smtp`
- EmDash CLI is available through one of:
  - `EMDASH_CLI_PATH`
  - an installed EmDash package that exposes its CLI
  - a sibling `../emdash` checkout with `packages/core/dist/cli/index.mjs`

## 1. Verify the workspace

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm validate:marketplace
pnpm bundle:marketplace
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
git tag v0.1.0
git push origin v0.1.0
```

## 3. Publish npm packages

Use `pnpm publish`, not raw `npm publish`, because the workspace uses `workspace:*` dependencies.

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

## 4. Publish to the EmDash marketplace

Authenticate if needed:

```bash
node scripts/run-emdash-cli.mjs plugin login
```

Publish the marketplace distribution:

```bash
pnpm publish:marketplace
```

Equivalent direct CLI command:

```bash
node scripts/run-emdash-cli.mjs plugin publish --dir packages/emdash-smtp-marketplace --build
```

## 5. Post-publish checks

Verify:

- `pnpm add @masonjames/emdash-smtp` installs cleanly in a separate project
- the marketplace listing appears as **EmDash SMTP**
- the marketplace listing shows the icon, screenshots, README, and expected capabilities
- a test email succeeds from the EmDash SMTP provider screen
- trusted installs and sandboxed installs are not both enabled on the same site
