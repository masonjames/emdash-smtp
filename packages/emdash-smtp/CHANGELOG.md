# Changelog

## 0.2.1

- Strengthened README and package metadata messaging directing installers to `emdash-smtp` rather than the internal `emdash-smtp-core`/`emdash-smtp-node-transports` packages
- Refreshed interdependency pins to the matching 0.2.1 releases

## 0.2.0

- Renamed the trusted npm package to the unscoped `emdash-smtp`
- Kept the same EmDash plugin ID and `astro.config.mjs` registration flow
- Clarified the split between trusted npm installs and marketplace publication

## 0.1.0

- Initial trusted EmDash SMTP release
- Full EmDash SMTP provider coverage, including generic SMTP and local sendmail
- Block Kit admin pages for provider configuration and delivery logs
- Shared provider catalog with fallback delivery support
