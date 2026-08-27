#!/usr/bin/env node
/**
 * Parse `coverage/lcov.info`, write `coverage/report.md`, and exit 1 when
 * line / branch / function coverage is below 95%.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const COVERAGE_THRESHOLD = 95;
export const REPORT_MARKER = "<!-- pi-coverage-report -->";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function toInt(value, fallback = 0) {
	if (value === undefined || value === "-" || value === "undefined" || value === "") {
		return fallback;
	}
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function percent(hits, total) {
	if (total <= 0) return 100;
	return (hits / total) * 100;
}

function formatPercent(value) {
	return `${value.toFixed(2)}%`;
}

export function parseLcov(text) {
	const files = [];
	for (const block of text.split("end_of_record")) {
		let path = "";
		let lf = 0;
		let lh = 0;
		let fnf = 0;
		let fnh = 0;
		let brf = 0;
		let brh = 0;
		for (const line of block.split(/\r?\n/)) {
			if (line.startsWith("SF:")) path = line.slice(3).trim();
			else if (line.startsWith("LF:")) lf = toInt(line.slice(3));
			else if (line.startsWith("LH:")) lh = toInt(line.slice(3));
			else if (line.startsWith("FNF:")) fnf = toInt(line.slice(4));
			else if (line.startsWith("FNH:")) fnh = toInt(line.slice(4));
			else if (line.startsWith("BRF:")) brf = toInt(line.slice(4));
			else if (line.startsWith("BRH:")) brh = toInt(line.slice(4));
		}
		if (!path) continue;
		files.push({
			path: path.replace(/\\/g, "/"),
			lf,
			lh,
			fnf,
			fnh,
			brf,
			brh,
			linePct: percent(lh, lf),
			branchPct: percent(brh, brf),
			funcPct: percent(fnh, fnf),
		});
	}
	return mergeDuplicateFiles(files);
}

function mergeDuplicateFiles(files) {
	const byPath = new Map();
	for (const file of files) {
		const previous = byPath.get(file.path);
		if (!previous) {
			byPath.set(file.path, file);
			continue;
		}
		const lf = Math.max(previous.lf, file.lf);
		const lh = Math.max(previous.lh, file.lh);
		const fnf = Math.max(previous.fnf, file.fnf);
		const fnh = Math.max(previous.fnh, file.fnh);
		const brf = Math.max(previous.brf, file.brf);
		const brh = Math.max(previous.brh, file.brh);
		byPath.set(file.path, {
			path: file.path,
			lf,
			lh,
			fnf,
			fnh,
			brf,
			brh,
			linePct: percent(lh, lf),
			branchPct: percent(brh, brf),
			funcPct: percent(fnh, fnf),
		});
	}
	return [...byPath.values()];
}

export function summarizeLcov(files, cwd = root) {
	const totals = files.reduce(
		(sum, file) => ({
			lf: sum.lf + file.lf,
			lh: sum.lh + file.lh,
			fnf: sum.fnf + file.fnf,
			fnh: sum.fnh + file.fnh,
			brf: sum.brf + file.brf,
			brh: sum.brh + file.brh,
		}),
		{ lf: 0, lh: 0, fnf: 0, fnh: 0, brf: 0, brh: 0 },
	);
	const relativeFiles = files.map((file) => ({
		...file,
		path: relative(cwd, resolve(cwd, file.path)).replace(/\\/g, "/") || file.path,
	}));
	relativeFiles.sort(
		(a, b) => a.branchPct - b.branchPct || a.linePct - b.linePct || a.path.localeCompare(b.path),
	);
	return {
		files: relativeFiles,
		totals: {
			...totals,
			linePct: percent(totals.lh, totals.lf),
			branchPct: percent(totals.brh, totals.brf),
			funcPct: percent(totals.fnh, totals.fnf),
		},
	};
}

export function coveragePassed(totals, threshold = COVERAGE_THRESHOLD) {
	return (
		totals.linePct >= threshold &&
		totals.branchPct >= threshold &&
		totals.funcPct >= threshold
	);
}

function belowThreshold(file, threshold = COVERAGE_THRESHOLD) {
	return (
		(file.lf > 0 && file.linePct < threshold) ||
		(file.brf > 0 && file.branchPct < threshold) ||
		(file.fnf > 0 && file.funcPct < threshold)
	);
}

function metricRow(label, hits, total, pct, threshold) {
	const ok = pct >= threshold;
	return `| ${label} | ${hits}/${total} | ${formatPercent(pct)} | ≥ ${threshold}% | ${ok ? "通过" : "未达标"} |`;
}

export function renderCoverageReport(summary, options = {}) {
	const threshold = options.threshold ?? COVERAGE_THRESHOLD;
	const passed = coveragePassed(summary.totals, threshold);
	const weak = summary.files.filter((file) => belowThreshold(file, threshold));
	const lines = [
		REPORT_MARKER,
		"## 测试覆盖率报告",
		"",
		passed
			? `**结论：允许合入。** 行 / 分支 / 函数覆盖率均 ≥ ${threshold}%。`
			: `**结论：禁止合入。** 行 / 分支 / 函数必须全部 ≥ ${threshold}%。`,
		"",
		"| 指标 | 命中 | 覆盖率 | 门禁 | 结果 |",
		"| --- | --- | --- | --- | --- |",
		metricRow("行", summary.totals.lh, summary.totals.lf, summary.totals.linePct, threshold),
		metricRow("分支", summary.totals.brh, summary.totals.brf, summary.totals.branchPct, threshold),
		metricRow("函数", summary.totals.fnh, summary.totals.fnf, summary.totals.funcPct, threshold),
		"",
		`计入统计的文件：${summary.files.length}。不必测的源码已从覆盖率排除。`,
	];
	if (weak.length > 0) {
		lines.push(
			"",
			`### 低于 ${threshold}% 的文件`,
			"",
			"| 文件 | 行 | 分支 | 函数 |",
			"| --- | --- | --- | --- |",
			...weak.map(
				(file) =>
					`| \`${file.path}\` | ${formatPercent(file.linePct)} | ${formatPercent(file.branchPct)} | ${formatPercent(file.funcPct)} |`,
			),
		);
	}
	return `${lines.join("\n")}\n`;
}

export async function writeCoverageReport(options = {}) {
	const lcovPath = options.lcovPath ?? join(root, "coverage/lcov.info");
	const reportPath = options.reportPath ?? join(root, "coverage/report.md");
	const cwd = options.cwd ?? root;
	let markdown;
	let passed = false;
	try {
		const files = parseLcov(await readFile(lcovPath, "utf8"));
		const summary = summarizeLcov(files, cwd);
		passed = coveragePassed(summary.totals);
		markdown = renderCoverageReport(summary);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		markdown = [
			REPORT_MARKER,
			"## 测试覆盖率报告",
			"",
			`**结论：禁止合入。** 无法读取覆盖率数据（${reason}）。`,
			"",
		].join("\n");
	}
	await mkdir(dirname(reportPath), { recursive: true });
	await writeFile(reportPath, markdown, "utf8");
	return { passed, markdown, reportPath };
}

const invokedDirectly =
	process.argv[1] !== undefined &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
	const result = await writeCoverageReport({
		lcovPath: process.argv[2],
		reportPath: process.argv[3],
	});
	process.stdout.write(result.markdown);
	process.exit(result.passed ? 0 : 1);
}
