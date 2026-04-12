import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const bundleTmpPath = resolve(import.meta.dirname, "../packages/emdash-smtp-marketplace/.emdash-bundle-tmp");
const runnerPath = resolve(import.meta.dirname, "./run-emdash-cli.mjs");

await rm(bundleTmpPath, { recursive: true, force: true });

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

process.exit(await run());
