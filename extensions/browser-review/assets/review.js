import {
	appendSafeMarkdown,
	applyCodeLayout,
	renderCodeDiff,
	renderDiffFiles,
	renderInlineDiff,
} from "./review-code.js";

const state = {
	source: null,
	view: "source",
	file: "",
	start: null,
	end: null,
	annotations: [],
	submitted: false,
};
const $ = (id) => document.querySelector(`#${id}`);

function lineLabel(index) {
	const line = state.source.lines[index];
	if (state.source.kind !== "code") return `L${index + 1}`;
	let position = `view L${index + 1}`;
	if (line.newLine != null) position = `L${line.newLine}`;
	else if (line.oldLine != null) position = `old L${line.oldLine}`;
	return line.file ? `${line.file}:${position}` : position;
}
function selectedRange() {
	if (state.start == null) return null;
	const end = state.end == null ? state.start : state.end;
	return [Math.min(state.start, end), Math.max(state.start, end)];
}
function overlaps(leftStart, leftEnd, rightStart, rightEnd) {
	return leftStart <= rightEnd && rightStart <= leftEnd;
}
function selectionHint(range) {
	if (range) {
		const end = range[0] === range[1] ? "" : `–${lineLabel(range[1])}`;
		return `已选择 ${lineLabel(range[0])}${end}`;
	}
	return state.view === "preview"
		? "选择一个内容块后添加评论"
		: "选择起止行后添加评论";
}
function updateSelection() {
	const range = selectedRange();
	$("selection").textContent = selectionHint(range);
	document.querySelectorAll("[data-source-index]").forEach((el) => {
		const index = Number(el.dataset.sourceIndex);
		const selected = Boolean(range && index >= range[0] && index <= range[1]);
		el.classList.toggle("selected", selected);
		el.setAttribute("aria-pressed", String(selected));
		if (!(el instanceof HTMLButtonElement)) {
			el.querySelector("button")?.setAttribute("aria-pressed", String(selected));
		}
	});
	document.querySelectorAll(".markdown-block").forEach((block) => {
		const start = Number(block.dataset.startLine);
		const end = Number(block.dataset.endLine);
		const selected = Boolean(range && overlaps(start, end, range[0], range[1]));
		const annotated = state.annotations.some((item) =>
			overlaps(start, end, item.startLine, item.endLine));
		block.classList.toggle("selected", selected);
		block.classList.toggle("annotated", annotated);
		block.setAttribute("aria-pressed", String(selected));
	});
}

function chooseLine(index) {
	if (state.start == null || state.end != null) {
		state.start = index;
		state.end = null;
	} else {
		state.end = index;
	}
	updateSelection();
}

function chooseBlock(start, end) {
	state.start = start;
	state.end = end;
	updateSelection();
	$("comment").focus();
}

function codeUi() {
	return { chooseLine, lineLabel };
}

function renderCurrentDiff() {
	if (state.source.kind === "code") renderCodeDiff(state, codeUi());
	else if (state.view === "source") renderInlineDiff(state, codeUi());
}

function pickFile(path) {
	state.file = path;
	applyCodeLayout(state);
	renderDiffFiles(state, pickFile);
	updateEditorTab();
	renderCurrentDiff();
	updateSelection();
}

function updateEditorTab() {
	const tab = document.querySelector(".editor-tab");
	if (state.source.kind !== "code") {
		tab.textContent = "审阅内容";
		return;
	}
	tab.textContent = state.file || (state.source.files?.length > 1 ? "全部文件" : "审阅内容");
}

function renderPreview() {
	const root = $("preview");
	for (const block of state.source.markdownBlocks || []) {
		const section = document.createElement("section");
		section.className = "markdown-block";
		section.tabIndex = 0;
		section.dataset.startLine = String(block.startLine);
		section.dataset.endLine = String(block.endLine);
		section.setAttribute("role", "button");
		section.setAttribute("aria-pressed", "false");
		section.setAttribute(
			"aria-label",
			`选择 ${lineLabel(block.startLine)}–${lineLabel(block.endLine)} 批注`,
		);
		appendSafeMarkdown(section, block.html);
		section.addEventListener("click", (event) => {
			if (event.target.closest("a")) return;
			chooseBlock(block.startLine, block.endLine);
		});
		section.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			chooseBlock(block.startLine, block.endLine);
		});
		root.append(section);
	}
}

function setView(view) {
	state.view = view;
	$("preview").hidden = view !== "preview";
	$("lines").hidden = view !== "source" || state.source.kind === "code";
	$("d2h").hidden = state.source.kind !== "code" || (view !== "split" && view !== "source");
	$("preview-tab").setAttribute("aria-pressed", String(view === "preview"));
	$("source-tab").setAttribute("aria-pressed", String(view === "source"));
	$("split-tab").setAttribute("aria-pressed", String(view === "split"));
	$("inline-tab").setAttribute("aria-pressed", String(view === "source"));
	renderCurrentDiff();
	updateSelection();
}

function renderAnnotations() {
	const root = $("annotations");
	root.replaceChildren();
	state.annotations.forEach((annotation, index) => {
		const card = document.createElement("article");
		card.className = "annotation";
		const range = document.createElement("strong");
		range.textContent = `${lineLabel(annotation.startLine)}${annotation.startLine === annotation.endLine ? "" : `–${lineLabel(annotation.endLine)}`}`;
		const comment = document.createElement("p");
		comment.textContent = annotation.comment;
		const remove = document.createElement("button");
		remove.type = "button";
		remove.textContent = "删除";
		remove.addEventListener("click", () => {
			state.annotations.splice(index, 1);
			renderAnnotations();
			updateSelection();
		});
		card.append(range, comment, remove);
		root.append(card);
	});
}

function addAnnotation() {
	const range = selectedRange();
	const comment = $("comment").value.trim();
	if (!range || !comment) {
		$("error").textContent = "请先选择内容并填写评论。";
		return;
	}
	state.annotations.push({ startLine: range[0], endLine: range[1], comment });
	state.start = null;
	state.end = null;
	$("comment").value = "";
	$("error").textContent = "";
	updateSelection();
	renderAnnotations();
}

async function submit(action) {
	if (action === "feedback" && state.annotations.length === 0) {
		$("error").textContent = "请至少添加一条批注。";
		return;
	}
	try {
		const response = await fetch("submit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action, annotations: state.annotations }),
		});
		const body = await response.json();
		if (!response.ok) throw new Error(body.error || "提交失败");
		state.submitted = true;
		const messages = {
			approve: "计划已批准并进入实现，可以关闭此页面。",
			defer: "计划已批准但暂不实现，可以关闭此页面。",
			feedback: "批注已发送，计划将继续编辑，可以关闭此页面。",
			abandon: "计划已取消，可以关闭此页面。",
			cancel: "审阅已关闭，计划保持不变。",
		};
		document.body.replaceChildren(Object.assign(document.createElement("p"), {
			className: "submitted",
			textContent: messages[action] || "操作已提交，可以关闭此页面。",
		}));
	} catch (error) {
		$("error").textContent = error instanceof Error ? error.message : String(error);
	}
}

function bindActions() {
	$("preview-tab").addEventListener("click", () => setView("preview"));
	$("source-tab").addEventListener("click", () => setView("source"));
	$("split-tab").addEventListener("click", () => setView("split"));
	$("inline-tab").addEventListener("click", () => setView("source"));
	$("add").addEventListener("click", addAnnotation);
	$("approve").addEventListener("click", () => submit("approve"));
	$("defer").addEventListener("click", () => submit("defer"));
	$("feedback").addEventListener("click", () => submit("feedback"));
	$("abandon").addEventListener("click", () => submit("abandon"));
	$("cancel").addEventListener("click", () => submit("cancel"));
}

async function start() {
	const response = await fetch("data", { cache: "no-store" });
	if (!response.ok) throw new Error("无法载入审阅内容");
	state.source = await response.json();
	document.title = state.source.title;
	$("title").textContent = state.source.title;
	$("subtitle").textContent = state.source.subtitle || "";
	const isPlan = state.source.kind === "plan";
	$("approve").hidden = !isPlan;
	$("defer").hidden = !isPlan;
	$("abandon").hidden = !isPlan;
	$("feedback").textContent = isPlan ? "继续编辑" : "发送批注";
	const isCode = state.source.kind === "code";
	const hasPreview = Boolean(state.source.markdownBlocks?.length);
	$("view-toggle").hidden = !(isCode || hasPreview);
	$("preview-tab").hidden = isCode;
	$("source-tab").hidden = isCode;
	$("split-tab").hidden = !isCode;
	$("inline-tab").hidden = !isCode;
	if (isCode) {
		$("view-toggle").setAttribute("aria-label", "Diff 视图");
		state.file = state.source.files?.[0]?.path ?? "";
		applyCodeLayout(state);
		renderDiffFiles(state, pickFile);
		updateEditorTab();
		setView("split");
	} else {
		if (hasPreview) renderPreview();
		setView(hasPreview ? "preview" : "source");
	}
	bindActions();
}

window.addEventListener("pagehide", () => {
	if (state.submitted) return;
	navigator.sendBeacon("submit", new Blob([
		JSON.stringify({ action: "cancel", annotations: [] }),
	], { type: "application/json" }));
});

start().catch((error) => {
	$("title").textContent = "载入失败";
	$("error").textContent = error instanceof Error ? error.message : String(error);
});
