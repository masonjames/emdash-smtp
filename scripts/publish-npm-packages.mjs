import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const PACKAGE_ORDER = [
	{ name: "emdash-smtp-core", dir: "packages/core" },
	{ name: "emdash-smtp-node-transports", dir: "packages/node-transports" },
	{ name: "emdash-smtp", dir: "packages/emdash-smtp" },
	{ name: "emdash-smtp-marketplace", dir: "packages/emdash-smtp-marketplace" },
];

function parseArgs(argv) {
	let from;
	const forward = [];

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--") {
			continue;
		}
		if (arg === "--from") {
			from = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg?.startsWith("--from=")) {
			from = arg.slice("--from=".length);
			continue;
		}
		forward.push(arg);
	}

	return { from, forward };
}

function hasAccessFlag(args) {
	return args.some((arg, index) => arg === "--access" || arg.startsWith("--access=") || args[index - 1] === "--access");
}

function hasDryRunFlag(args) {
	return args.some((arg) => arg === "--dry-run" || arg === "--dry-run=true");
}

function npmAuthIsConfigured(env) {
	return Boolean(env.NODE_AUTH_TOKEN || env.NPM_TOKEN || env.NPM_CONFIG_USERCONFIG);
}

function configureNpmAuth(args) {
	const env = { ...process.env };
	if (hasDryRunFlag(args) || npmAuthIsConfigured(env)) {
		return { env, cleanup: () => {} };
	}

	let token;
	try {
		token = execFileSync("op", ["item", "get", "NPM TOKEN", "--fields", "label=credential", "--reveal"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`npm auth is not configured and the 1Password item "NPM TOKEN" could not be read. ${detail}`,
		);
	}

	if (!token) {
		throw new Error('npm auth is not configured and the 1Password item "NPM TOKEN" was empty.');
	}

	const authDir = mkdtempSync(resolve(tmpdir(), "emdash-smtp-npm-"));
	const userconfig = resolve(authDir, ".npmrc");
	writeFileSync(userconfig, `//registry.npmjs.org/:_authToken=${token}\n`, { mode: 0o600 });
	env.NPM_CONFIG_USERCONFIG = userconfig;

	try {
		const whoami = execFileSync("npm", ["whoami"], {
			encoding: "utf8",
			env,
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		if (whoami) console.log(`npm auth: ${whoami}`);
	} catch (error) {
		rmSync(authDir, { recursive: true, force: true });
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`npm auth failed with the token from 1Password. ${detail}`);
	}

	return {
		env,
		cleanup: () => rmSync(authDir, { recursive: true, force: true }),
	};
}

function runPublish(pkg, args, env) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(pnpmCommand, args, {
			cwd: resolve(rootDir, pkg.dir),
			stdio: "inherit",
			env,
		});

		child.on("error", rejectRun);
		child.on("exit", (code, signal) => {
			if (signal) {
				rejectRun(new Error(`pnpm publish exited via signal ${signal}`));
				return;
			}
			resolveRun(code ?? 1);
		});
	});
}

const { from, forward } = parseArgs(process.argv.slice(2));
const startIndex = from
	? PACKAGE_ORDER.findIndex((pkg) => pkg.name === from || pkg.dir === from || pkg.dir.endsWith(`/${from}`))
	: 0;

if (from && startIndex === -1) {
	console.error(`Unknown package for --from: ${from}`);
	process.exit(1);
}

const publishArgs = ["publish", ...(hasAccessFlag(forward) ? [] : ["--access", "public"]), ...forward];
const npmAuth = configureNpmAuth(forward);

try {
	let failedPackage;
	let failedExitCode = 0;
	for (const pkg of PACKAGE_ORDER.slice(startIndex)) {
		console.log(`\n==> Publishing ${pkg.name} from ${pkg.dir}`);
		const exitCode = await runPublish(pkg, publishArgs, npmAuth.env);
		if (exitCode !== 0) {
			failedPackage = pkg;
			failedExitCode = exitCode;
			break;
		}
	}

	if (failedPackage) {
		console.error(`\nPublish failed for ${failedPackage.name}. Resume with:`);
		console.error(`pnpm publish:npm -- --from ${failedPackage.name}`);
		process.exitCode = failedExitCode;
	} else {
		console.log("\nAll npm packages published successfully.");
	}
} finally {
	npmAuth.cleanup();
}
