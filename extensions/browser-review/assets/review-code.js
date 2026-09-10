export function applyCodeLayout(state) {
  const files = state.source.files || [];
  const show = state.source.kind === "code" && files.length > 1;
  $("diff-files").hidden = !show;
  $("editor-content").classList.toggle("code-layout", show);
}

export function renderDiffFiles(state, onPick) {
  const root = $("diff-files");
  root.replaceChildren();
  const files = state.source.files || [];
  if (files.length <= 1) return;
  root.append(fileButton("全部", "", state.file === "", onPick));
  for (const file of files) {
    const stats = `+${file.added} −${file.removed}`;
    root.append(fileButton(file.path, file.path, state.file === file.path, onPick, stats));
  }
}

export function renderCodeDiff(state, { chooseLine }) {
  const root = $("d2h");
  const html = state.view === "split" ? state.source.diffHtml : state.source.diffHtmlInline;
  root.innerHTML = html || "";
  bindDiffRows(root, state.source.lines);
  filterDiffFiles(root, state.file);
  root.onclick = (event) => {
    const row = event.target.closest("[data-source-index]");
    if (!row || !root.contains(row)) return;
    if (event.target.closest("input,label,a")) return;
    chooseLine(Number(row.dataset.sourceIndex));
  };
  root.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-source-index]");
    if (!row || !root.contains(row)) return;
    event.preventDefault();
    chooseLine(Number(row.dataset.sourceIndex));
  };
}

export function renderInlineDiff(state, { chooseLine, lineLabel }) {
  const root = $("lines");
  root.replaceChildren();
  state.source.lines.forEach((line, index) => {
    if (state.file && line.file !== state.file) return;
    const row = document.createElement("div");
    row.className = `line ${line.style || "plain"}`;
    row.dataset.sourceIndex = String(index);
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
    if (line.html) appendSafeMarkdown(code, line.html);
    else code.textContent = line.text || " ";
    row.append(code);
    root.append(row);
  });
}

function bindDiffRows(root, lines) {
  for (const wrapper of root.querySelectorAll(".d2h-file-wrapper")) {
    const file = wrapper.querySelector(".d2h-file-name")?.textContent.trim() || "";
    const sides = wrapper.querySelectorAll(".d2h-file-side-diff");
    if (sides.length === 2) {
      bindSideTable(sides[0], lines, file, "old");
      bindSideTable(sides[1], lines, file, "new");
    } else {
      bindInlineTable(wrapper, lines, file);
    }
  }
  for (const pre of root.querySelectorAll(".d2h-fallback")) {
    const file = pre.getAttribute("data-file") || "";
    const index = lines.findIndex((line) => line.file === file);
    if (index < 0) continue;
    pre.dataset.sourceIndex = String(index);
    pre.tabIndex = 0;
    pre.setAttribute("role", "button");
  }
}

function bindSideTable(table, lines, file, side) {
  for (const td of table.querySelectorAll(".d2h-code-side-linenumber")) {
    markRow(td.closest("tr"), td, lines, file, side, Number(td.textContent.trim()));
  }
}

function bindInlineTable(wrapper, lines, file) {
  for (const td of wrapper.querySelectorAll(".d2h-code-linenumber")) {
    const kind = lineKind(td);
    if (!kind) continue;
    const oldNo = Number(td.querySelector(".line-num1")?.textContent.trim());
    const newNo = Number(td.querySelector(".line-num2")?.textContent.trim());
    const side = kind === "addition" ? "new" : "old";
    const lineNo = side === "new" ? newNo : oldNo;
    markRow(td.closest("tr"), td, lines, file, side, lineNo);
  }
}

function markRow(row, td, lines, file, side, lineNo) {
  const kind = lineKind(td);
  if (!row || !kind || !Number.isInteger(lineNo)) return;
  const index = matchSourceIndex(lines, file, kind, lineNo, side);
  if (index == null) return;
  row.dataset.sourceIndex = String(index);
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-pressed", "false");
}

function lineKind(el) {
  if (el.classList.contains("d2h-info")) return undefined;
  if (el.classList.contains("d2h-del")) return "deletion";
  if (el.classList.contains("d2h-ins")) return "addition";
  if (el.classList.contains("d2h-cntx")) return "context";
  return undefined;
}

function matchSourceIndex(lines, file, kind, lineNo, side) {
  const index = lines.findIndex((line) => {
    if (line.file !== file || line.style !== kind) return false;
    return side === "old" ? line.oldLine === lineNo : line.newLine === lineNo;
  });
  return index < 0 ? undefined : index;
}

function filterDiffFiles(root, file) {
  for (const wrapper of root.querySelectorAll(".d2h-file-wrapper")) {
    const name = wrapper.querySelector(".d2h-file-name")?.textContent.trim() || "";
    wrapper.hidden = Boolean(file && name !== file);
  }
  for (const pre of root.querySelectorAll(".d2h-fallback")) {
    const name = pre.getAttribute("data-file") || "";
    pre.hidden = Boolean(file && name !== file);
  }
}

function fileButton(label, path, current, onPick, stats) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "diff-file";
  button.setAttribute("aria-current", String(current));
  const name = document.createElement("span");
  name.className = "diff-file-name";
  name.textContent = label;
  button.append(name);
  if (stats) {
    const meta = document.createElement("span");
    meta.className = "diff-file-stats";
    meta.textContent = stats;
    button.append(meta);
  }
  button.addEventListener("click", () => onPick(path));
  return button;
}

function $(id) {
  return document.querySelector(`#${id}`);
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
  if (target.localName === "ol" && source.hasAttribute("start")) {
    const start = source.getAttribute("start") || "";
    if (/^\d+$/.test(start)) target.setAttribute("start", start);
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

export function appendSafeMarkdown(target, html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const fragment = document.createDocumentFragment();
  for (const child of parsed.body.childNodes) fragment.append(safeMarkdownNode(child));
  target.append(fragment);
}
