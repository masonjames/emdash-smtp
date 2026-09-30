# Release runbook

The existing GitHub repository stays public: https://github.com/masonjames/emdash-smtp.

1. Bump all package versions and `SMTP_PLUGIN_VERSION` together. Releases from 0.4.0 require EmDash 1.0.1.
2. Run `pnpm release:check` and `pnpm publish:npm -- --dry-run` in a clean isolated checkout.
3. Push a release branch, review its pull request and hosted checks, then merge to `main`.
4. Check out the merged commit before publication.
5. Publish npm packages in dependency order with `pnpm publish:npm`.
6. Authenticate once with `pnpm exec emdash-plugin login masonjames.com`, then run `pnpm publish:marketplace`.
7. Verify published npm versions with a fresh consumer and inspect registry approval using the command printed by the CLI. Record publication and directory visibility separately.

The npm publisher uses configured authentication or the concealed `credential` field of the 1Password item `NPM TOKEN`. It creates a temporary mode-0600 config, verifies `pnpm whoami`, and removes the config afterward. Do not put credentials in shell arguments or Git.

If npm publication partially succeeds, resume with `pnpm publish:npm -- --from <first-unpublished-package>`.

Only the sandbox distribution is registry eligible. Native SMTP/sendmail transports remain in the `emdash-smtp` npm distribution. Registry installations do not automatically migrate existing npm settings or logs. Never activate both distributions together.
