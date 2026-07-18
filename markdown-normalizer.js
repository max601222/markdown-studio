/**
 * Tolerate a prompt-style document wrapper that incorrectly uses the same
 * fence width as the fenced examples inside it.
 *
 * This is deliberately narrow because equal-width fences are ambiguous in
 * Markdown. We only repair a whole-document, bare fence envelope when its
 * first inner fence has an info string (for example, ```typescript). That
 * distinguishes the supported prompt wrapper from ordinary adjacent blocks.
 */
function normalizeNestedFenceEnvelope(markdown) {
  if (!markdown) return markdown;

  var newline = markdown.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
  var lines = markdown.split(/\r?\n/);
  var first = 0;
  var last = lines.length - 1;

  while (first <= last && /^\s*$/.test(lines[first])) first++;
  while (last >= first && /^\s*$/.test(lines[last])) last--;
  if (first >= last) return markdown;

  var opening = lines[first].match(/^( {0,3})(`{3,}|~{3,})[ \t]*$/);
  var closing = lines[last].match(/^( {0,3})(`{3,}|~{3,})[ \t]*$/);
  if (!opening || !closing) return markdown;

  var marker = opening[2].charAt(0);
  var outerLength = opening[2].length;
  if (closing[2].charAt(0) !== marker || closing[2].length !== outerLength)
    return markdown;

  var innerFences = [];
  var fencePattern = new RegExp(
    "^( {0,3})(" + (marker === "`" ? "`" : "~") + "{3,})(.*)$",
  );
  for (var i = first + 1; i < last; i++) {
    var match = lines[i].match(fencePattern);
    if (match) {
      innerFences.push({
        length: match[2].length,
        info: match[3].trim(),
      });
    }
  }

  // A language-tagged first inner fence provides the only reliable signal
  // that the first bare fence belongs to an outer prompt wrapper.
  if (
    innerFences.length < 2 ||
    !innerFences[0].info ||
    !innerFences.slice(1).some(function (fence) {
      return !fence.info;
    })
  )
    return markdown;

  var maxInnerLength = innerFences.reduce(function (max, fence) {
    return Math.max(max, fence.length);
  }, 0);
  if (outerLength > maxInnerLength) return markdown;

  var expandedFence = new Array(maxInnerLength + 2).join(marker);
  lines[first] = opening[1] + expandedFence;
  lines[last] = closing[1] + expandedFence;
  return lines.join(newline);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { normalizeNestedFenceEnvelope };
}
