const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function getSafeHttpUrl(value: string | undefined) {
  const candidate = value?.trim();

  if (!candidate) {
    return undefined;
  }

  if (
    URL_SCHEME_PATTERN.test(candidate) &&
    !candidate.toLowerCase().startsWith("http:") &&
    !candidate.toLowerCase().startsWith("https:")
  ) {
    return undefined;
  }

  try {
    const url = new URL(
      candidate.startsWith("//")
        ? `https:${candidate}`
        : URL_SCHEME_PATTERN.test(candidate)
          ? candidate
          : `https://${candidate}`,
    );

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export type LinkTextPart =
  | { type: "text"; text: string }
  | { href: string; type: "link"; text: string };

// Only explicit http(s) URLs become links; bare domains stay plain text so
// ordinary words such as "Node.js" are never linked.
const URL_IN_TEXT_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = ".,;:!?'\"";
const BRACKET_PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function splitTextIntoLinkParts(text: string): LinkTextPart[] {
  const parts: LinkTextPart[] = [];
  let textStart = 0;

  for (const match of text.matchAll(URL_IN_TEXT_PATTERN)) {
    const candidate = trimTrailingPunctuation(match[0]);
    const href = getSafeHttpUrl(candidate);

    if (!href) {
      continue;
    }

    const start = match.index;

    if (start > textStart) {
      parts.push({ type: "text", text: text.slice(textStart, start) });
    }

    parts.push({ href, type: "link", text: candidate });
    textStart = start + candidate.length;
  }

  if (textStart < text.length) {
    parts.push({ type: "text", text: text.slice(textStart) });
  }

  return parts;
}

// Sentence punctuation after a URL is not part of it, but a closing bracket
// that balances one inside the URL is, as in wiki/Example_(company).
function trimTrailingPunctuation(url: string) {
  let trimmed = url;

  while (trimmed) {
    const last = trimmed[trimmed.length - 1];
    const opening = BRACKET_PAIRS[last];

    if (TRAILING_PUNCTUATION.includes(last)) {
      trimmed = trimmed.slice(0, -1);
    } else if (
      opening &&
      countCharacter(trimmed, opening) < countCharacter(trimmed, last)
    ) {
      trimmed = trimmed.slice(0, -1);
    } else {
      break;
    }
  }

  return trimmed;
}

function countCharacter(value: string, character: string) {
  return value.split(character).length - 1;
}
