import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

function resolveExplicitCli() {
	const explicitPath = process.env.EMDASH_CLI_PATH;
	if (!explicitPath) return null;
	const candidate = resolve(explicitPath);
	return existsSync(candidate) ? candidate : null;
}

function resolveInstalledCli() {
	try {
		const packageJsonPath = require.resolve("emdash/package.json");
		const candidate = resolve(dirname(packageJsonPath), "dist/cli/index.mjs");
		return existsSync(candidate) ? candidate : null;
	} catch {
		return null;
	}
}

function resolveWorkspaceFallbackCli() {
	const candidate = resolve(import.meta.dirname, "../../emdash/packages/core/dist/cli/index.mjs");
	return existsSync(candidate) ? candidate : null;
}

const cliPath = resolveExplicitCli() ?? resolveInstalledCli() ?? resolveWorkspaceFallbackCli();

if (!cliPath) {
	console.error(
		[
			"Unable to locate the EmDash CLI.",
			"",
			"Checked:",
			"- $EMDASH_CLI_PATH",
			"- installed package: emdash/dist/cli/index.mjs",
			"- sibling workspace: ../emdash/packages/core/dist/cli/index.mjs",
			"",
			"Set EMDASH_CLI_PATH, or run `pnpm install` and `pnpm --dir ../emdash/packages/core build`, or install a published EmDash package that includes the CLI.",
		].join("\n"),
	);
	process.exit(1);
}

const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
	stdio: "inherit",
	env: process.env,
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 1);
});
