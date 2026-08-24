const state = { source: null, start: null, end: null, annotations: [], submitted: false };
const $ = (id) => document.getElementById(id);

function lineLabel(index) {
  const line = state.source.lines[index];
  if (state.source.kind !== "code") return `L${index + 1}`;
  const position = line.newLine != null ? `L${line.newLine}` : line.oldLine != null ? `old L${line.oldLine}` : `view L${index + 1}`;
  return line.file ? `${line.file}:${position}` : position;
}

function selectedRange() {
  if (state.start == null) return null;
  const end = state.end == null ? state.start : state.end;
  return [Math.min(state.start, end), Math.max(state.start, end)];
}

function updateSelection() {
  const range = selectedRange();
  $("selection").textContent = range
    ? `已选择 ${lineLabel(range[0])}${range[0] === range[1] ? "" : `–${lineLabel(range[1])}`}`
    : "选择起止行后添加评论";
  document.querySelectorAll(".line").forEach((row, index) => {
    const selected = range && index >= range[0] && index <= range[1];
    row.classList.toggle("selected", Boolean(selected));
    row.querySelector("button").setAttribute("aria-pressed", String(Boolean(selected)));
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
    });
    card.append(range, comment, remove);
    root.append(card);
  });
}

function addAnnotation() {
  const range = selectedRange();
  const comment = $("comment").value.trim();
  if (!range || !comment) {
    $("error").textContent = "请先选择行范围并填写评论。";
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
    document.body.replaceChildren(Object.assign(document.createElement("p"), {
      className: "submitted",
      textContent: action === "cancel" ? "已取消，可以关闭此页面。" : "审阅意见已发送，可以关闭此页面。",
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
  $("approve").hidden = state.source.kind !== "plan";
  renderLines();
  $("add").addEventListener("click", addAnnotation);
  $("approve").addEventListener("click", () => submit("approve"));
  $("feedback").addEventListener("click", () => submit("feedback"));
  $("cancel").addEventListener("click", () => submit("cancel"));
}

window.addEventListener("pagehide", () => {
  if (state.submitted) return;
  navigator.sendBeacon("submit", new Blob([JSON.stringify({ action: "cancel", annotations: [] })], { type: "application/json" }));
});

start().catch((error) => {
  $("title").textContent = "载入失败";
  $("error").textContent = error instanceof Error ? error.message : String(error);
});
