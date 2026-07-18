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

test("keeps a valid wider outer fence unchanged", () => {
  const markdown = "````\n```typescript\ntype Id = string;\n```\n````";
  assert.equal(normalizeNestedFenceEnvelope(markdown), markdown);
});

test("preserves CRLF and expands beyond the widest inner fence", () => {
  const markdown =
    "```\r\n````text\r\ninner\r\n````\r\nafter\r\n```";
  const normalized = normalizeNestedFenceEnvelope(markdown);

  assert.ok(normalized.startsWith("`````\r\n"));
  assert.ok(normalized.endsWith("\r\n`````"));
  assert.equal((normalized.match(/\r\n/g) || []).length, 5);
});
