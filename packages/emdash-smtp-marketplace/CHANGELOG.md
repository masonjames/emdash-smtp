# Changelog

## 0.4.1

- Remove obsolete gallery illustrations that showed retired package names and confused native SMTP transports with the registry distribution.
- Clarify independent authorship and the registry distribution’s HTTP API/OAuth scope.
- Preserve runtime behavior, storage and permissions.

## 0.4.0

- Require EmDash 1.0.1 and use current email transport and network permissions.
- Publish the sandbox variant through the current EmDash plugin CLI and publisher manifest.
- Preserve the native npm factory and SMTP/sendmail transports.
- Validate admin interactions before changing settings; test private provider settings, HTTP delivery, logs, restart persistence and Block Kit screens in the official sandbox.

## 0.3.4

- Reworked the SMTP Providers admin page into a guided single-provider setup flow with compact quick picks and a full-provider dropdown for edge cases.
- Bumped `emdash-smtp-core` dependency pin to 0.3.4.

## 0.3.3

- Added package-level plugin identity metadata for marketplace trust review.
- Refreshed `emdash-smtp-core` dependency pin to 0.3.3.

## 0.2.1

- Refreshed README/package metadata clarifying supported install targets (`emdash-smtp`, `emdash-smtp-marketplace`)
- Bumped `emdash-smtp-core` dependency pin to 0.2.1

## 0.2.0

- Renamed the marketplace-safe npm package to the unscoped `emdash-smtp-marketplace`
- Kept the official `emdash plugin publish` marketplace flow
- Clarified the split between the trusted and sandbox-safe SMTP distributions

## 0.1.0

- Initial marketplace-safe EmDash SMTP release
- HTTP API and OAuth-capable provider coverage for the marketplace-safe EmDash SMTP package
- Block Kit admin UI for provider configuration, testing, and delivery logs
- Ready for `emdash plugin bundle` and `emdash plugin publish`
