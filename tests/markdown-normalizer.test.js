const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeNestedFenceEnvelope,
} = require("../markdown-normalizer.js");

test("expands a whole-document fence around language-tagged inner fences", () => {
  const markdown = [
    "```",
    "請建立 Stock Watchlist。",
    "",
    "### 型別定義",
    "",
    "```typescript",
    "interface WatchlistItem { symbol: string }",
    "```",
    "",
    "### 環境變數",
    "",
    "```",
    "PORT=3001",
    "```",
    "",
    "Phase 9：響應式設計",
    "```",
  ].join("\n");

  const normalized = normalizeNestedFenceEnvelope(markdown);

  assert.ok(normalized.startsWith("````\n"));
  assert.ok(normalized.endsWith("\n````"));
  assert.match(normalized, /```typescript/);
  assert.match(normalized, /Phase 9：響應式設計/);
});

test("expands an embedded prompt wrapper until the next peer section", () => {
  const markdown = [
    "# Stock Watchlist（美股追蹤）建置 Prompt",
    "",
    "## 🚀 建置 Prompt",
    "",
    "以下 prompt 可以直接貼給 Codex / Claude Code 使用：",
    "",
    "```",
    "請幫我建立一個 Stock Watchlist。",
    "",
    "### 型別定義",
    "",
    "```typescript",
    "interface WatchlistItem { symbol: string }",
    "```",
    "",
    "### 環境變數",
    "",
    "```",
    "PORT=3001",
    "```",
    "",
    "### 建置優先順序",
    "",
    "Phase 9：響應式設計 + 動畫效果",
    "```",
    "",
    "## 🔧 建置後設定",
    "",
    "```bash",
    "FMP_API_KEY=your_actual_api_key_here",
    "```",
  ].join("\n");

  const normalized = normalizeNestedFenceEnvelope(markdown);
  const lines = normalized.split("\n");

  assert.equal(lines[6], "````");
  assert.equal(lines[24], "````");
  assert.equal(lines[28], "```bash");
  assert.equal(lines[30], "```");
});

test("allows a thematic break between an embedded wrapper and the next section", () => {
  const markdown = [
    "# Kanban Dashboard",
    "",
    "## 🚀 建置 Prompt",
    "",
    "---",
    "",
    "```",
    "請建立 Kanban Dashboard。",
    "",
    "### 型別定義",
    "",
    "```typescript",
    "interface Task { id: string }",
    "```",
    "",
    "### 環境變數",
    "",
    "```",
    "PORT=3000",
    "```",
    "",
    "### UI/UX 設計要求",
    "",
    "Phase 9：AI 整合",
    "```",
    "",
    "---",
    "",
    "## 🔧 建置後設定",
    "",
    "```bash",
    "mkdir -p public/uploads",
    "```",
  ].join("\n");

  const normalized = normalizeNestedFenceEnvelope(markdown);
  const lines = normalized.split("\n");

  assert.equal(lines[6], "````");
  assert.equal(lines[24], "````");
  assert.equal(lines[30], "```bash");
});

test("leaves a regular fenced block unchanged", () => {
  const markdown = "```js\nconsole.log('ok');\n```";
  assert.equal(normalizeNestedFenceEnvelope(markdown), markdown);
});

test("does not merge adjacent plain and language-tagged blocks", () => {
  const markdown = [
    "```",
    "plain block",
    "```",
    "",
    "paragraph",
    "",
    "```js",
    "const answer = 42;",
    "```",
  ].join("\n");

  assert.equal(normalizeNestedFenceEnvelope(markdown), markdown);
});

test("does not repair an embedded wrapper without a direct section boundary", () => {
  const markdown = [
    "## Prompt",
    "",
    "```",
    "```typescript",
    "type Id = string;",
    "```",
    "```",
    "PORT=3001",
    "```",
    "```",
    "",
    "This paragraph still belongs to the section.",
    "",
    "## Next section",
  ].join("\n");

  assert.equal(normalizeNestedFenceEnvelope(markdown), markdown);
});

test("does not treat a thematic break followed by a paragraph as a section boundary", () => {
  const markdown = [
    "## Prompt",
    "",
    "```",
    "```typescript",
    "type Id = string;",
    "```",
    "```",
    "PORT=3001",
    "```",
    "```",
    "",
    "---",
    "",
    "This paragraph still belongs to the section.",
  ].join("\n");

  assert.equal(normalizeNestedFenceEnvelope(markdown), markdown);
});

test("requires two complete inner blocks before repairing", () => {
  const markdown = [
    "## Prompt",
    "",
    "```",
    "```typescript",
    "type Id = string;",
    "```",
    "```",
    "",
    "## Next section",
  ].join("\n");

  assert.equal(normalizeNestedFenceEnvelope(markdown), markdown);
});

test("keeps a valid wider outer fence unchanged", () => {
  const markdown = "````\n```typescript\ntype Id = string;\n```\n````";
  assert.equal(normalizeNestedFenceEnvelope(markdown), markdown);
});

test("preserves CRLF and expands beyond the widest inner fence", () => {
  const markdown =
    "```\r\n````text\r\ninner\r\n````\r\n```\r\nsecond\r\n```\r\n```";
  const normalized = normalizeNestedFenceEnvelope(markdown);

  assert.ok(normalized.startsWith("`````\r\n"));
  assert.ok(normalized.endsWith("\r\n`````"));
  assert.equal((normalized.match(/\r\n/g) || []).length, 7);
});
