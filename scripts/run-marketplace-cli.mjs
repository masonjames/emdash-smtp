import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const packageJsonPath = resolve(import.meta.dirname, "../packages/emdash-smtp-marketplace/package.json");
const bundleTmpPath = resolve(import.meta.dirname, "../packages/emdash-smtp-marketplace/.emdash-bundle-tmp");
const runnerPath = resolve(import.meta.dirname, "./run-emdash-cli.mjs");

const originalText = await readFile(packageJsonPath, "utf8");
const original = JSON.parse(originalText);
const patched = {
	...original,
	main: "src/index.ts",
	exports: {
		".": "./src/index.ts",
		"./sandbox": "./src/sandbox-entry.ts",
	},
};

await rm(bundleTmpPath, { recursive: true, force: true });
await writeFile(packageJsonPath, `${JSON.stringify(patched, null, 2)}\n`);

function run() {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(process.execPath, [runnerPath, ...process.argv.slice(2)], {
			stdio: "inherit",
			env: process.env,
		});

		child.on("error", rejectRun);
		child.on("exit", (code, signal) => {
			if (signal) {
				rejectRun(new Error(`Marketplace CLI exited via signal ${signal}`));
				return;
			}
			resolveRun(code ?? 1);
		});
	});
}

let exitCode = 1;

try {
	exitCode = /** @type {number} */ (await run());
} finally {
	await writeFile(packageJsonPath, originalText);
	await rm(bundleTmpPath, { recursive: true, force: true });
}

process.exit(exitCode);
