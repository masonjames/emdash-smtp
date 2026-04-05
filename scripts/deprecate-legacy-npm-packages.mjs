import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const LEGACY_PACKAGES = [
  {
    name: "@masonjames/emdash-smtp-core",
    message:
      "Deprecated implementation package. Do not install directly; use emdash-smtp or emdash-smtp-marketplace instead.",
  },
  {
    name: "@masonjames/emdash-smtp-node-transports",
    message: "Deprecated implementation package. Do not install directly; use emdash-smtp instead.",
  },
  {
    name: "@masonjames/emdash-smtp",
    message: "Deprecated: install emdash-smtp instead.",
  },
  {
    name: "@masonjames/emdash-smtp-marketplace",
    message: "Deprecated: install emdash-smtp-marketplace instead.",
  },
];

function runNpm(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(npmCommand, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (signal) {
        rejectRun(new Error(`npm deprecate exited via signal ${signal}`));
        return;
      }
      resolveRun(code ?? 1);
    });
  });
}

for (const pkg of LEGACY_PACKAGES) {
  console.log(`\n==> Deprecating ${pkg.name}`);
  const exitCode = await runNpm(["deprecate", `${pkg.name}@*`, pkg.message]);
  if (exitCode !== 0) {
    console.error(`Failed to deprecate ${pkg.name}`);
    process.exit(exitCode);
  }
}

console.log("\nAll legacy npm packages deprecated successfully.");
