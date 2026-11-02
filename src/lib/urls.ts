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
// ordinary words such as "Node.js" are never linked. The lookbehind skips a
// scheme glued to a preceding word, as in "xhttps://".
const URL_IN_TEXT_PATTERN = /(?<![\w/:])https?:\/\/[^\s<>"']+/gi;
const MAX_LINKED_URL_LENGTH = 2048;
const TRAILING_PUNCTUATION = ".,;:!?'\"*_\u2026\u3002\uff0c\u3001\uff1b\uff1a\uff01\uff1f";
const BRACKET_PAIRS: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
  "\uff09": "\uff08",
};

export function splitTextIntoLinkParts(text: string): LinkTextPart[] {
  const parts: LinkTextPart[] = [];
  let textStart = 0;

  for (const match of text.matchAll(URL_IN_TEXT_PATTERN)) {
    if (match[0].length > MAX_LINKED_URL_LENGTH) {
      continue;
    }

    const candidate = trimTrailingPunctuation(match[0]);
    const href = getLinkableUrl(candidate);

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

// Credentials in a URL let the visible text disguise the real host, as in
// https://jobs.example.com@other.example, so those stay plain text.
function getLinkableUrl(candidate: string) {
  const href = getSafeHttpUrl(candidate);

  if (!href) {
    return undefined;
  }

  const url = new URL(href);
  return url.username || url.password ? undefined : href;
}

// Sentence punctuation after a URL is not part of it, but a closing bracket
// that balances one inside the URL is, as in wiki/Example_(company).
function trimTrailingPunctuation(url: string) {
  const unmatchedClosers = new Map<string, number>();

  for (const [closing, opening] of Object.entries(BRACKET_PAIRS)) {
    unmatchedClosers.set(
      closing,
      countCharacter(url, closing) - countCharacter(url, opening),
    );
  }

  let end = url.length;

  while (end > 0) {
    const last = url[end - 1];
    const unmatched = unmatchedClosers.get(last);

    if (TRAILING_PUNCTUATION.includes(last)) {
      end -= 1;
    } else if (unmatched !== undefined && unmatched > 0) {
      unmatchedClosers.set(last, unmatched - 1);
      end -= 1;
    } else {
      break;
    }
  }

  return url.slice(0, end);
}

function countCharacter(value: string, character: string) {
  return value.split(character).length - 1;
}
