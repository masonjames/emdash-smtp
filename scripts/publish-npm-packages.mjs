import { spawn } from "node:child_process";
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

function runPublish(pkg, args) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(pnpmCommand, args, {
			cwd: resolve(rootDir, pkg.dir),
			stdio: "inherit",
			env: process.env,
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

for (const pkg of PACKAGE_ORDER.slice(startIndex)) {
	console.log(`\n==> Publishing ${pkg.name} from ${pkg.dir}`);
	const exitCode = await runPublish(pkg, publishArgs);
	if (exitCode !== 0) {
		console.error(`\nPublish failed for ${pkg.name}. Resume with:`);
		console.error(`pnpm publish:npm -- --from ${pkg.name}`);
		process.exit(exitCode);
	}
}

console.log("\nAll npm packages published successfully.");
