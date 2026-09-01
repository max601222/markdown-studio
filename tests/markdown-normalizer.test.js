const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeNestedFenceEnvelope,
  formatMarkdownDocument,
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

test("format preserves nested list indentation and ordered list numbers", () => {
  const markdown = [
    "1. 先檢查既有紀錄。",
    "2. 若沒有任何過期紀錄：",
    "   - 保留原有內容不變。",
    "   - 直接追加至原檔案末端。",
    "3. 重新讀取後必須確認：",
    "   - 每個非空行均可解析。",
    "   - 本次新增紀錄至少包含：",
    "     - `news_id`",
    "     - `reported_date`",
  ].join("\n");

  assert.equal(formatMarkdownDocument(markdown), markdown);
});

test("format keeps a paragraph outside the preceding table", () => {
  const markdown = [
    "這次成功了！以下是找到的頁面列表：",
    "",
    "| 頁面標題 | 最後更新 |",
    "| --- | --- |",
    "| 公司簡介 | 2026/03/12 |",
    "",
    "看起來你有在維護一份定期更新的筆記。",
  ].join("\n");

  assert.equal(
    formatMarkdownDocument(markdown),
    [
      "這次成功了！以下是找到的頁面列表：",
      "| 頁面標題 | 最後更新 |",
      "| --- | --- |",
      "| 公司簡介 | 2026/03/12 |",
      "",
      "看起來你有在維護一份定期更新的筆記。",
    ].join("\n"),
  );
});

test("format removes all ordinary blank lines between paragraphs", () => {
  const markdown = ["第一段。", "", "", "第二段。", "", "第三段。"].join("\n");

  assert.equal(
    formatMarkdownDocument(markdown),
    ["第一段。", "第二段。", "第三段。"].join("\n"),
  );
});

test("format does not insert a blank line before a table", () => {
  const markdown = [
    "以下是頁面列表：",
    "",
    "| 頁面標題 | 最後更新 |",
    "| --- | --- |",
    "| 公司簡介 | 2026/03/12 |",
  ].join("\n");

  assert.equal(
    formatMarkdownDocument(markdown),
    [
      "以下是頁面列表：",
      "| 頁面標題 | 最後更新 |",
      "| --- | --- |",
      "| 公司簡介 | 2026/03/12 |",
    ].join("\n"),
  );
});

test("format inserts a missing blank line after a GFM table", () => {
  const markdown = [
    "| 頁面標題 | 最後更新 |",
    "| --- | --- |",
    "| 公司簡介 | 2026/03/12 |",
    "看起來你有在維護一份定期更新的筆記。",
  ].join("\n");

  assert.equal(
    formatMarkdownDocument(markdown),
    [
      "| 頁面標題 | 最後更新 |",
      "| --- | --- |",
      "| 公司簡介 | 2026/03/12 |",
      "",
      "看起來你有在維護一份定期更新的筆記。",
    ].join("\n"),
  );
});

test("format does not alter content inside fenced code blocks", () => {
  const markdown = [
    "```md",
    "| not | a table |   ",
    "| --- | --- |",
    "   - indentation and trailing spaces stay exact   ",
    "```",
  ].join("\n");

  assert.equal(formatMarkdownDocument(markdown), markdown);
});

test("format is idempotent", () => {
  const markdown = [
    "# 標題",
    "",
    "1. 項目",
    "   - 子項目",
    "",
    "| 欄位 | 值 |",
    "| --- | --- |",
    "| A | B |",
    "後續段落",
  ].join("\n");
  const formatted = formatMarkdownDocument(markdown);

  assert.equal(formatMarkdownDocument(formatted), formatted);
});

test("format preserves the boundary after unordered and ordered lists", () => {
  const markdown = [
    "視角固定為供給側：",
    "",
    "- 達暉提供人力與工程能力",
    "- 客戶決定內部技術選型與採購",
    "",
    "必含：",
    "",
    "1. 機會",
    "2. 風險",
    "",
    "不得把後續段落寫進清單。",
  ].join("\n");

  assert.equal(
    formatMarkdownDocument(markdown),
    [
      "視角固定為供給側：",
      "- 達暉提供人力與工程能力",
      "- 客戶決定內部技術選型與採購",
      "",
      "必含：",
      "1. 機會",
      "2. 風險",
      "",
      "不得把後續段落寫進清單。",
    ].join("\n"),
  );
});

test("format removes unnecessary blank lines between list items", () => {
  const markdown = ["- A", "", "+ B", "", "1. C", "", "2. D"].join("\n");

  assert.equal(
    formatMarkdownDocument(markdown),
    ["- A", "+ B", "1. C", "2. D"].join("\n"),
  );
});

test("format preserves a second paragraph inside a list item", () => {
  const markdown = ["- 第一段", "", "  第二段", "- 下一項"].join("\n");

  assert.equal(formatMarkdownDocument(markdown), markdown);
});

test("format preserves the boundary after a block quote", () => {
  const markdown = ["> 引言", "", "後續段落。"].join("\n");

  assert.equal(formatMarkdownDocument(markdown), markdown);
});

test("format preserves a required blank before indented code", () => {
  const markdown = ["前段。", "", "    const value = 1;", "後段。"].join("\n");

  assert.equal(formatMarkdownDocument(markdown), markdown);
});

test("format preserves blank lines inside indented code", () => {
  const markdown = [
    "    const first = 1;",
    "",
    "",
    "    const second = 2;",
    "後段。",
  ].join("\n");

  assert.equal(
    formatMarkdownDocument(markdown),
    ["    const first = 1;", "", "    const second = 2;", "後段。"].join("\n"),
  );
});

test("format removes an unnecessary blank between a quote and a list", () => {
  const markdown = ["> 引言", "", "- 項目"].join("\n");

  assert.equal(
    formatMarkdownDocument(markdown),
    ["> 引言", "- 項目"].join("\n"),
  );
});

test("format distinguishes Setext headings from thematic breaks", () => {
  const heading = ["標題", "---", "後段。"].join("\n");
  const thematicBreak = ["前段。", "", "---", "", "後段。"].join("\n");

  assert.equal(formatMarkdownDocument(heading), heading);
  assert.equal(
    formatMarkdownDocument(thematicBreak),
    ["前段。", "", "---", "後段。"].join("\n"),
  );
});

test("format preserves boundaries for link references and non-one ordered lists", () => {
  const reference = ["前段。", "", "[id]: /url"].join("\n");
  const ordered = ["前段。", "", "2. 第二項"].join("\n");

  assert.equal(formatMarkdownDocument(reference), reference);
  assert.equal(formatMarkdownDocument(ordered), ordered);
});

test("format preserves the terminating blank after an HTML block", () => {
  const markdown = ["<div>", "raw content", "</div>", "", "後續段落。"].join(
    "\n",
  );

  assert.equal(formatMarkdownDocument(markdown), markdown);
});

test("format preserves hard line breaks and indented fenced content", () => {
  const hardBreak = ["第一行   ", "第二行"].join("\n");
  const nestedFence = [
    "- 程式碼",
    "    ```md",
    "    第一行   ",
    "",
    "    第二行",
    "    ```",
  ].join("\n");

  assert.equal(
    formatMarkdownDocument(hardBreak),
    ["第一行  ", "第二行"].join("\n"),
  );
  assert.equal(formatMarkdownDocument(nestedFence), nestedFence);
});

test("format removes unnecessary spacing around explicit blocks", () => {
  const markdown = [
    "前段。",
    "",
    "# 標題",
    "",
    "| 欄位 | 值 |",
    "| --- | --- |",
    "| A | B |",
    "",
    "> 引言",
  ].join("\n");

  assert.equal(
    formatMarkdownDocument(markdown),
    [
      "前段。",
      "# 標題",
      "| 欄位 | 值 |",
      "| --- | --- |",
      "| A | B |",
      "> 引言",
    ].join("\n"),
  );
});
