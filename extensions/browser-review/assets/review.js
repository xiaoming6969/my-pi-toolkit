const state = {
  source: null,
  view: "source",
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
  document.querySelectorAll(".line").forEach((row, index) => {
    const selected = Boolean(range && index >= range[0] && index <= range[1]);
    row.classList.toggle("selected", selected);
    row.querySelector("button").setAttribute("aria-pressed", String(selected));
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

function renderLines() {
  const root = $("lines");
  state.source.lines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = `line ${line.style || "plain"}`;
    row.setAttribute("role", "listitem");
    for (const value of [line.oldLine, line.newLine]) {
      const number = document.createElement("span");
      number.className = "line-number";
      number.textContent = value == null ? "" : String(value);
      row.append(number);
    }
    const select = document.createElement("button");
    select.className = "line-select";
    select.type = "button";
    select.textContent = String(index + 1);
    select.title = `选择 ${lineLabel(index)}`;
    select.setAttribute("aria-label", `选择 ${lineLabel(index)}`);
    select.setAttribute("aria-pressed", "false");
    select.addEventListener("click", () => chooseLine(index));
    row.append(select);
    const code = document.createElement("code");
    code.textContent = line.text || " ";
    row.append(code);
    root.append(row);
  });
}

const MARKDOWN_TAGS = new Set([
  "a", "blockquote", "br", "code", "del", "em", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "img", "input", "li", "ol", "p", "pre", "span",
  "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);

function copySafeAttributes(source, target) {
  if (source.hasAttribute("class")) target.className = source.className;
  if (source.hasAttribute("title")) target.title = source.title;
  if (target.localName === "pre" && source.getAttribute("role") === "img") {
    target.setAttribute("role", "img");
    target.setAttribute("aria-label", source.getAttribute("aria-label") || "Mermaid 图");
  }
  if (["td", "th"].includes(target.localName) && source.hasAttribute("align")) {
    target.setAttribute("align", source.getAttribute("align"));
  }
  if (target.localName === "a") {
    const href = source.getAttribute("href") || "";
    if (/^(https?:|mailto:|#)/i.test(href)) target.setAttribute("href", href);
    target.setAttribute("target", "_blank");
    target.setAttribute("rel", "noreferrer noopener");
  }
  if (target.localName === "img") {
    const src = source.getAttribute("src") || "";
    if (source.classList.contains("md-mermaid-svg") && src.startsWith("data:image/svg+xml;base64,")) {
      target.setAttribute("src", src);
      target.setAttribute("alt", source.getAttribute("alt") || "Mermaid 图");
    }
  }
  if (target.localName === "input" && source.getAttribute("type") === "checkbox") {
    target.setAttribute("type", "checkbox");
    target.disabled = true;
    target.checked = source.hasAttribute("checked");
  }
}

function safeMarkdownNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
  const name = node.localName.toLowerCase();
  const target = MARKDOWN_TAGS.has(name)
    ? document.createElement(name)
    : document.createDocumentFragment();
  if (target instanceof HTMLElement) copySafeAttributes(node, target);
  for (const child of node.childNodes) target.append(safeMarkdownNode(child));
  return target;
}

function appendSafeMarkdown(target, html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const fragment = document.createDocumentFragment();
  for (const child of parsed.body.childNodes) fragment.append(safeMarkdownNode(child));
  target.append(fragment);
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
  const preview = view === "preview";
  $("preview").hidden = !preview;
  $("lines").hidden = preview;
  $("preview-tab").setAttribute("aria-pressed", String(preview));
  $("source-tab").setAttribute("aria-pressed", String(!preview));
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
  renderLines();
  const hasPreview = Boolean(state.source.markdownBlocks?.length);
  $("view-toggle").hidden = !hasPreview;
  if (hasPreview) renderPreview();
  setView(hasPreview ? "preview" : "source");
  $("preview-tab").addEventListener("click", () => setView("preview"));
  $("source-tab").addEventListener("click", () => setView("source"));
  $("add").addEventListener("click", addAnnotation);
  $("approve").addEventListener("click", () => submit("approve"));
  $("defer").addEventListener("click", () => submit("defer"));
  $("feedback").addEventListener("click", () => submit("feedback"));
  $("abandon").addEventListener("click", () => submit("abandon"));
  $("cancel").addEventListener("click", () => submit("cancel"));
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
