import { describe, expect, it } from "vitest";

import { sendmailSend, smtpSend } from "../src/index.js";

describe("emdash-smtp-node-transports", () => {
	it("exports trusted transport adapters", () => {
		expect(typeof smtpSend).toBe("function");
		expect(typeof sendmailSend).toBe("function");
	});
});
