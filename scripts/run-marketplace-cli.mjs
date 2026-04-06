import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const packageJsonPath = resolve(import.meta.dirname, "../packages/emdash-smtp-marketplace/package.json");
const bundleTmpPath = resolve(import.meta.dirname, "../packages/emdash-smtp-marketplace/.emdash-bundle-tmp");
const runnerPath = resolve(import.meta.dirname, "./run-emdash-cli.mjs");

const originalText = await readFile(packageJsonPath, "utf8");
const original = JSON.parse(originalText);
const originalExports =
	original.exports && typeof original.exports === "object" && !Array.isArray(original.exports) ? original.exports : {};

function patchExportTarget(existing, sourcePath) {
	if (typeof existing === "string") return sourcePath;
	if (existing && typeof existing === "object" && !Array.isArray(existing)) {
		return {
			...existing,
			import: sourcePath,
			default: sourcePath,
		};
	}
	return sourcePath;
}

const patched = {
	...original,
	main: "src/index.ts",
	exports: {
		...originalExports,
		".": patchExportTarget(originalExports["."], "./src/index.ts"),
		"./sandbox": patchExportTarget(originalExports["./sandbox"], "./src/sandbox-entry.ts"),
	},
};

let restored = false;
let restorePromise;

function restoreWorkspace() {
	if (restorePromise) return restorePromise;
	restorePromise = (async () => {
		if (restored) return;
		restored = true;
		await writeFile(packageJsonPath, originalText);
		await rm(bundleTmpPath, { recursive: true, force: true });
	})();
	return restorePromise;
}

async function exitAfterRestore(code) {
	try {
		await restoreWorkspace();
	} finally {
		process.exit(code);
	}
}

async function signalAfterRestore(signal) {
	try {
		await restoreWorkspace();
	} finally {
		process.kill(process.pid, signal);
	}
}

process.once("SIGINT", () => {
	void signalAfterRestore("SIGINT");
});

process.once("SIGTERM", () => {
	void signalAfterRestore("SIGTERM");
});

process.once("uncaughtException", (error) => {
	console.error(error);
	void exitAfterRestore(1);
});

process.once("unhandledRejection", (reason) => {
	console.error(reason);
	void exitAfterRestore(1);
});

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
	await restoreWorkspace();
}

process.exit(exitCode);
