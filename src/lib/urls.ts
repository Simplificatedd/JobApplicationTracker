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
