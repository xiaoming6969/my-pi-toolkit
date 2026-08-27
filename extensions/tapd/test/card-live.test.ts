import assert from "node:assert/strict";
import test from "node:test";
import {
	publishCard,
	resolveLiveDetails,
	truncateDisplayResult,
	type TapdGitMessageDetails,
} from "../git/card-live.ts";

test("truncateDisplayResult keeps short output and clips long logs", () => {
	assert.equal(truncateDisplayResult("ok"), "ok");
	const lines = Array.from({ length: 21 }, (_, index) => `L${index}`);
	const clipped = truncateDisplayResult(lines.join("\n"));
	assert.match(clipped, /已截断 1 行/);
	assert.equal(clipped.split("\n").length, 21);
});

test("publishCard updates live details by runId", () => {
	const seed: TapdGitMessageDetails = {
		command: "commit",
		status: "active",
		runId: "run-card-live-test",
		progress: { step: 1, total: 3, message: "start" },
	};
	assert.deepEqual(resolveLiveDetails(seed), seed);
	publishCard({ ...seed, status: "success", result: "done" });
	assert.equal(resolveLiveDetails(seed)?.status, "success");
	assert.equal(resolveLiveDetails(seed)?.result, "done");
	assert.equal(resolveLiveDetails({ command: "mr", status: "active" })?.command, "mr");
});
