/**
 * Tolerate a prompt-style document wrapper that incorrectly uses the same
 * fence width as the fenced examples inside it.
 *
 * This is deliberately narrow because equal-width fences are ambiguous in
 * Markdown. We only repair a bare fence whose first inner fence has an info
 * string (for example, ```typescript) and whose closing fence reaches the end
 * of its current Markdown section. That distinguishes a prompt wrapper from
 * ordinary adjacent blocks.
 */
function normalizeNestedFenceEnvelope(markdown) {
  if (!markdown) return markdown;

  var newline = markdown.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
  var lines = markdown.split(/\r?\n/);
  var currentHeadingLevel = 0;

  function parseFence(line) {
    var match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
    if (!match) return null;
    return {
      indent: match[1],
      marker: match[2].charAt(0),
      length: match[2].length,
      info: match[3].trim(),
    };
  }

  function findNextFence(start, marker) {
    for (var index = start; index < lines.length; index++) {
      var fence = parseFence(lines[index]);
      if (fence && fence.marker === marker)
        return { index: index, fence: fence };
    }
    return null;
  }

  function findClosingFence(start, marker, minLength) {
    for (var index = start; index < lines.length; index++) {
      var fence = parseFence(lines[index]);
      if (
        fence &&
        fence.marker === marker &&
        !fence.info &&
        fence.length >= minLength
      )
        return { index: index, fence: fence };
    }
    return null;
  }

  function isSectionClose(index, headingLevel) {
    for (var nextLine = index + 1; nextLine < lines.length; nextLine++) {
      if (/^\s*$/.test(lines[nextLine])) continue;
      if (!headingLevel) return false;

      var heading = lines[nextLine].match(/^ {0,3}(#{1,6})[ \t]+/);
      return !!heading && heading[1].length <= headingLevel;
    }
    return true;
  }

  for (var i = 0; i < lines.length; i++) {
    var heading = lines[i].match(/^ {0,3}(#{1,6})[ \t]+/);
    if (heading) currentHeadingLevel = heading[1].length;

    var opening = parseFence(lines[i]);
    if (!opening) continue;

    // A normal language-tagged block is unambiguous; skip through its close so
    // that the closing fence is never reconsidered as a wrapper opening.
    if (opening.info) {
      var regularClose = findClosingFence(
        i + 1,
        opening.marker,
        opening.length,
      );
      if (regularClose) i = regularClose.index;
      continue;
    }

    var firstInner = findNextFence(i + 1, opening.marker);
    if (!firstInner) continue;

    // If the next matching fence is bare, this is an ordinary fenced block.
    if (!firstInner.fence.info) {
      if (firstInner.fence.length >= opening.length) i = firstInner.index;
      continue;
    }

    var innerFence = null;
    var completedInnerBlocks = 0;
    var hasTaggedInnerBlock = false;
    var maxInnerLength = 0;
    var closingIndex = -1;
    var searchFrom = firstInner.index;
    while (searchFrom < lines.length) {
      var next = findNextFence(searchFrom, opening.marker);
      if (!next) break;

      if (
        !innerFence &&
        !next.fence.info &&
        next.fence.length >= opening.length &&
        completedInnerBlocks >= 2 &&
        hasTaggedInnerBlock &&
        isSectionClose(next.index, currentHeadingLevel)
      ) {
        closingIndex = next.index;
        break;
      }

      maxInnerLength = Math.max(maxInnerLength, next.fence.length);
      if (!innerFence) {
        innerFence = next.fence;
        if (next.fence.info) hasTaggedInnerBlock = true;
      } else if (
        !next.fence.info &&
        next.fence.length >= innerFence.length
      ) {
        innerFence = null;
        completedInnerBlocks++;
      }
      searchFrom = next.index + 1;
    }

    if (closingIndex === -1) continue;

    if (opening.length <= maxInnerLength) {
      var expandedFence = new Array(maxInnerLength + 2).join(opening.marker);
      var closing = parseFence(lines[closingIndex]);
      lines[i] = opening.indent + expandedFence;
      lines[closingIndex] = closing.indent + expandedFence;
    }
    i = closingIndex;
  }

  return lines.join(newline);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { normalizeNestedFenceEnvelope };
}
