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
      if (
        /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(
          lines[nextLine],
        )
      )
        continue;
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
      } else if (!next.fence.info && next.fence.length >= innerFence.length) {
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

/**
 * Format Markdown without changing indentation-sensitive document structure.
 *
 * Leading whitespace is meaningful for nested lists, continuation lines and
 * indented code blocks, so only trailing whitespace is removed. Ordinary
 * blank lines are removed. A single blank is retained only where removing it
 * would change block parsing (for example after lists or block quotes), and a
 * GFM table is always separated from following plain text. ATX headings are a
 * deliberate style exception and keep one blank line above and below.
 *
 * @param {string} markdown Markdown source to format.
 * @returns {string} Formatted Markdown using LF line endings.
 * @sideEffects None. The input string is never mutated.
 * @throws Does not throw for empty or string-coercible input.
 */
function formatMarkdownDocument(markdown) {
  if (!markdown) return "";

  var lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  var result = [];
  var activeFence = null;
  var pendingBlank = false;
  var blankTerminatedHtml = false;
  var htmlBoundaryPending = false;
  var lastBlockType = null;
  var listBaseIndent = null;

  function pushBlankLine() {
    if (result.length && result[result.length - 1] !== "") result.push("");
  }

  function parseFence(line) {
    var match = line.match(/^([ \t]*)(`{3,}|~{3,})(.*)$/);
    if (!match) return null;
    return {
      indent: getIndentWidth(match[1]),
      marker: match[2].charAt(0),
      length: match[2].length,
      info: match[3].trim(),
    };
  }

  function getIndentWidth(whitespace) {
    var width = 0;
    for (var index = 0; index < whitespace.length; index++) {
      width += whitespace.charAt(index) === "\t" ? 4 : 1;
    }
    return width;
  }

  function getLineIndent(line) {
    var match = line.match(/^[ \t]*/);
    return getIndentWidth(match ? match[0] : "");
  }

  function normalizeLineEnd(line) {
    if (/^(?: {4}|\t)/.test(line)) return line;
    var trailing = line.match(/ +$/);
    if (!trailing) return line.replace(/\t+$/g, "");
    return (
      line.slice(0, -trailing[0].length) + (trailing[0].length >= 2 ? "  " : "")
    );
  }

  function parseListItem(line) {
    var match = line.match(/^([ \t]*)([-+*]|\d{1,9}[.)])(?:[ \t]+|$)/);
    if (!match) return null;
    return {
      indent: getIndentWidth(match[1]),
      marker: match[2],
      orderedNumber: /^\d/.test(match[2]) ? parseInt(match[2], 10) : null,
    };
  }

  function isAtxHeading(line) {
    return /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line);
  }

  function isBlockQuote(line) {
    return /^ {0,3}>/.test(line);
  }

  function isIndentedCode(line) {
    return /^(?: {4}|\t)/.test(line);
  }

  function isLinkReference(line) {
    return /^ {0,3}\[[^\]]+\]:[ \t]*\S/.test(line);
  }

  function isSetextUnderline(line) {
    return /^ {0,3}(?:=+|-+)[ \t]*$/.test(line);
  }

  function isThematicBreak(line) {
    return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(
      line,
    );
  }

  function isBlankTerminatedHtmlStart(line) {
    var tagNames =
      "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
    var blockTag = new RegExp(
      "^ {0,3}</?(?:" + tagNames + ")(?=[\\s/>]|$)",
      "i",
    );
    var completeTag =
      /^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:[ \t]+[^<>]*)?\/?>[ \t]*$/;
    return blockTag.test(line) || completeTag.test(line);
  }

  function isSetextHeadingText(index) {
    return (
      index + 1 < lines.length &&
      lines[index + 1].trim() &&
      isSetextUnderline(lines[index + 1])
    );
  }

  function hasTablePipe(line) {
    return /(^|[^\\])\|/.test(line);
  }

  function isTableDelimiter(line) {
    var value = line.trim();
    if (!hasTablePipe(value)) return false;
    if (value.charAt(0) === "|") value = value.slice(1);
    if (value.charAt(value.length - 1) === "|") value = value.slice(0, -1);
    var cells = value.split("|");
    return (
      cells.length > 0 &&
      cells.every(function (cell) {
        return /^\s*:?-{3,}:?\s*$/.test(cell);
      })
    );
  }

  function isTableStart(index) {
    if (index + 1 >= lines.length) return false;
    return (
      hasTablePipe(lines[index]) &&
      isTableDelimiter(lines[index + 1].replace(/[ \t]+$/g, ""))
    );
  }

  for (var i = 0; i < lines.length; i++) {
    var originalLine = lines[i];
    var fence = parseFence(originalLine);

    if (activeFence) {
      result.push(originalLine);
      if (
        fence &&
        fence.marker === activeFence.marker &&
        fence.length >= activeFence.length &&
        !fence.info
      ) {
        activeFence = null;
        lastBlockType = "fence";
      }
      continue;
    }

    if (blankTerminatedHtml) {
      if (!originalLine.trim()) {
        blankTerminatedHtml = false;
        htmlBoundaryPending = true;
        pendingBlank = true;
      } else {
        result.push(originalLine);
        lastBlockType = "html";
      }
      continue;
    }

    if (!originalLine.trim()) {
      pendingBlank = true;
      continue;
    }

    var line = normalizeLineEnd(originalLine);
    var listItem = parseListItem(line);
    var lineIndent = getLineIndent(line);
    var atxHeading = isAtxHeading(line);
    var blockQuote = isBlockQuote(line);
    var indentedCode = isIndentedCode(line);
    var linkReference = isLinkReference(line);
    var setextUnderline = isSetextUnderline(line);
    var setextHeading =
      setextUnderline && !pendingBlank && lastBlockType === "paragraph";
    var thematicBreak = isThematicBreak(line) && !setextHeading;
    var htmlStart = isBlankTerminatedHtmlStart(line);
    var tableStart = isTableStart(i);
    var explicitBlock =
      !!fence ||
      atxHeading ||
      blockQuote ||
      !!listItem ||
      thematicBreak ||
      htmlStart ||
      tableStart;
    var preservePendingBlank = htmlBoundaryPending;

    if (pendingBlank && !preservePendingBlank) {
      if (lastBlockType === "list") {
        var continuesList =
          !listItem &&
          !explicitBlock &&
          (listBaseIndent === null || lineIndent > listBaseIndent);
        var endsAsParagraph = !explicitBlock && !listItem;
        preservePendingBlank = continuesList || endsAsParagraph;
      } else if (lastBlockType === "blockquote") {
        preservePendingBlank = blockQuote || !explicitBlock;
      } else if (lastBlockType === "indented-code") {
        preservePendingBlank = indentedCode;
      } else if (lastBlockType === "paragraph") {
        preservePendingBlank =
          indentedCode ||
          linkReference ||
          isSetextHeadingText(i) ||
          (listItem !== null &&
            listItem.orderedNumber !== null &&
            listItem.orderedNumber !== 1) ||
          (thematicBreak && /^ {0,3}-/.test(line)) ||
          htmlStart;
      }
    }

    if (preservePendingBlank) pushBlankLine();
    var hadPendingBlank = pendingBlank;
    pendingBlank = false;
    htmlBoundaryPending = false;

    if (atxHeading) pushBlankLine();

    if (fence) {
      result.push(normalizeLineEnd(originalLine));
      activeFence = fence;
      if (lastBlockType === "list" && fence.indent <= listBaseIndent) {
        listBaseIndent = null;
      }
      continue;
    }

    if (isTableStart(i)) {
      result.push(line);
      result.push(normalizeLineEnd(lines[++i]));
      while (
        i + 1 < lines.length &&
        lines[i + 1].trim() &&
        hasTablePipe(lines[i + 1])
      ) {
        result.push(normalizeLineEnd(lines[++i]));
      }
      var nextContentIndex = i + 1;
      while (
        nextContentIndex < lines.length &&
        !lines[nextContentIndex].trim()
      ) {
        nextContentIndex++;
      }
      if (nextContentIndex < lines.length) {
        var nextContent = lines[nextContentIndex];
        var nextListItem = parseListItem(nextContent);
        var nextIsExplicitBlock =
          !!parseFence(nextContent) ||
          isAtxHeading(nextContent) ||
          isBlockQuote(nextContent) ||
          isThematicBreak(nextContent) ||
          isBlankTerminatedHtmlStart(nextContent) ||
          !!nextListItem ||
          isTableStart(nextContentIndex);
        if (!nextIsExplicitBlock) pushBlankLine();
      }
      lastBlockType = "table";
      listBaseIndent = null;
      continue;
    }

    if (htmlStart) {
      result.push(originalLine);
      blankTerminatedHtml = true;
      lastBlockType = "html";
      listBaseIndent = null;
      continue;
    }

    result.push(line);

    if (atxHeading) pushBlankLine();

    if (listItem) {
      if (listBaseIndent === null || listItem.indent < listBaseIndent) {
        listBaseIndent = listItem.indent;
      }
      lastBlockType = "list";
    } else if (lastBlockType === "list" && !explicitBlock) {
      if (hadPendingBlank && lineIndent <= listBaseIndent) {
        listBaseIndent = null;
        lastBlockType = "paragraph";
      }
    } else if (blockQuote) {
      lastBlockType = "blockquote";
      listBaseIndent = null;
    } else if (lastBlockType === "blockquote" && !explicitBlock) {
      if (hadPendingBlank) lastBlockType = "paragraph";
    } else if (atxHeading || setextHeading || thematicBreak) {
      lastBlockType = atxHeading || setextHeading ? "heading" : "break";
      listBaseIndent = null;
    } else if (indentedCode) {
      lastBlockType = "indented-code";
      listBaseIndent = null;
    } else if (linkReference) {
      lastBlockType = "reference";
      listBaseIndent = null;
    } else {
      lastBlockType = "paragraph";
      listBaseIndent = null;
    }
  }

  while (result.length && result[0] === "") result.shift();
  while (result.length && result[result.length - 1] === "") result.pop();
  return result.join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { normalizeNestedFenceEnvelope, formatMarkdownDocument };
}
