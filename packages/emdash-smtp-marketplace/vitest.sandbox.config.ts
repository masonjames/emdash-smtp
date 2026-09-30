import { emdashPluginTest } from "@emdash-cms/plugin-test/config";
import { defineConfig } from "vitest/config";
export default defineConfig({ plugins: [emdashPluginTest()], test: { include: ["tests/sandbox.test.ts"], testTimeout: 60_000 } });
