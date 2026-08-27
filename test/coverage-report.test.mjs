import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	COVERAGE_THRESHOLD,
	coveragePassed,
	parseLcov,
	percent,
	renderCoverageReport,
	summarizeLcov,
	writeCoverageReport,
} from "../scripts/coverage-report.mjs";

const passLcov = `TN:
SF:extensions/sample/ok.ts
FNF:2
FNH:2
BRF:4
BRH:4
LF:10
LH:10
end_of_record
`;

const failLcov = `TN:
SF:extensions/sample/weak.ts
FNF:4
FNH:2
BRF:10
BRH:8
LF:20
LH:18
end_of_record
TN:
SF:extensions/sample/ok.ts
FNF:2
FNH:2
BRF:4
BRH:4
LF:10
LH:10
end_of_record
`;

test("percent treats empty totals as 100%", () => {
	assert.equal(percent(0, 0), 100);
	assert.equal(percent(19, 20), 95);
});

test("parseLcov merges duplicate SF records and ignores undefined counts", () => {
	const files = parseLcov(`TN:
SF:extensions/sample/dup.ts
FNF:undefined
FNH:1
BRF:2
BRH:1
LF:4
LH:3
end_of_record
TN:
SF:extensions/sample/dup.ts
FNF:2
FNH:2
BRF:4
BRH:3
LF:4
LH:4
end_of_record
`);
	assert.equal(files.length, 1);
	assert.equal(files[0]?.lh, 4);
	assert.equal(files[0]?.brh, 3);
	assert.equal(files[0]?.fnh, 2);
});

test("writeCoverageReport passes when every metric is at least 95%", async () => {
	const dir = mkdtempSync(join(tmpdir(), "coverage-pass-"));
	const lcovPath = join(dir, "lcov.info");
	const reportPath = join(dir, "report.md");
	writeFileSync(lcovPath, passLcov);
	const result = await writeCoverageReport({ lcovPath, reportPath, cwd: dir });
	assert.equal(result.passed, true);
	assert.match(result.markdown, /允许合入/);
	assert.equal(coveragePassed(summarizeLcov(parseLcov(passLcov)).totals), true);
	assert.equal(COVERAGE_THRESHOLD, 95);
});

test("writeCoverageReport fails when any metric is below 95%", async () => {
	const dir = mkdtempSync(join(tmpdir(), "coverage-fail-"));
	const lcovPath = join(dir, "lcov.info");
	const reportPath = join(dir, "report.md");
	writeFileSync(lcovPath, failLcov);
	const result = await writeCoverageReport({ lcovPath, reportPath, cwd: dir });
	const summary = summarizeLcov(parseLcov(failLcov));
	assert.equal(result.passed, false);
	assert.equal(coveragePassed(summary.totals), false);
	assert.match(result.markdown, /禁止合入/);
	assert.match(result.markdown, /weak\.ts/);
	assert.match(renderCoverageReport(summary), /未达标/);
});

test("writeCoverageReport forbids merge when lcov is missing", async () => {
	const dir = mkdtempSync(join(tmpdir(), "coverage-missing-"));
	const result = await writeCoverageReport({
		lcovPath: join(dir, "missing.info"),
		reportPath: join(dir, "report.md"),
		cwd: dir,
	});
	assert.equal(result.passed, false);
	assert.match(result.markdown, /无法读取覆盖率数据/);
});
