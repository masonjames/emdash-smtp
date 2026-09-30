# Publishing

EmDash SMTP has two public install targets: `emdash-smtp` for native SMTP/sendmail and HTTP providers, and `emdash-smtp-marketplace` for sandbox-safe HTTP/OAuth delivery. The shared implementation packages publish first so npm resolves dependencies.

```sh
pnpm release:check
pnpm publish:npm -- --dry-run
pnpm publish:npm
pnpm exec emdash-plugin login masonjames.com
pnpm publish:marketplace
```

Publish from the reviewed merged commit. npm order is core, node-transports, native plugin, sandbox plugin. The root publisher supports `--from <package>` after a partial failure and reads the approved 1Password credential when no auth config is provided.

The sandbox package has `emdash-plugin.jsonc`, `src/plugin.ts`, a pinned `@emdash-cms/plugin-cli`, and declared listing images. `publish:marketplace` runs `emdash-plugin publish` inside that package. It uploads the self-contained artifact and images to the publisher PDS and creates package/release records under `@masonjames.com`. Versions are immutable. Public directory visibility follows approval.

The existing npm factories remain supported. The registry uses a publisher-scoped plugin identity; it does not automatically import npm settings or logs. Only one distribution should be active per site.

The old `emdash plugin publish` and GitHub device-token flow are retired. No sibling EmDash checkout is required. See [the release runbook](RELEASE.md) for source, verification and post-publication steps.
