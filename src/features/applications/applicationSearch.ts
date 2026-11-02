import type { Application } from "../../types/application";

interface RankedApplication {
  application: Application;
  rank: number;
}

interface FuzzyOptions {
  // Company names are short, so loose abbreviations such as "ms" would match
  // unrelated companies and outrank every title match.
  strict?: boolean;
}

// Field order is the ranking priority: any company match outranks any title
// match, which outranks any description-only match.
const SEARCH_FIELDS: Array<{
  fuzzy: FuzzyOptions;
  value: (application: Application) => string;
}> = [
  { fuzzy: { strict: true }, value: (application) => application.company },
  { fuzzy: {}, value: (application) => application.jobTitle },
  { fuzzy: {}, value: (application) => application.jobDescription },
];

const MATCH_TIERS_PER_FIELD = 4;

export function searchApplications(
  applications: Application[],
  rawQuery: string,
) {
  const query = normalizeSearchText(rawQuery);

  if (!query) {
    return applications;
  }

  // Ranks are fixed tiers rather than scores, so keyword frequency and field
  // length never matter. The stable sort keeps the caller's order for ties.
  return applications
    .map((application): RankedApplication | null => {
      const rank = rankApplication(application, query);
      return rank === null ? null : { application, rank };
    })
    .filter((result): result is RankedApplication => result !== null)
    .sort((left, right) => left.rank - right.rank)
    .map((result) => result.application);
}

function rankApplication(application: Application, query: string) {
  for (const [fieldIndex, field] of SEARCH_FIELDS.entries()) {
    const tier = matchTier(field.value(application), query, field.fuzzy);

    if (tier !== null) {
      return fieldIndex * MATCH_TIERS_PER_FIELD + tier;
    }
  }

  return null;
}

// 0 exact, 1 starts with, 2 contains, 3 fuzzy.
function matchTier(rawValue: string, query: string, fuzzy: FuzzyOptions) {
  const value = normalizeSearchText(rawValue);

  if (!value) {
    return null;
  }

  if (value === query) {
    return 0;
  }

  if (value.startsWith(query)) {
    return 1;
  }

  if (value.includes(query)) {
    return 2;
  }

  return fuzzyScore(value, query, fuzzy) > 0 ? 3 : null;
}

function normalizeSearchText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function fuzzyScore(
  value: string,
  query: string,
  options: FuzzyOptions = {},
) {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedValue || !normalizedQuery) {
    return 0;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return 100 + normalizedQuery.length / normalizedValue.length;
  }

  // Preserve technology names such as C++, C#, .NET, and Node.js while
  // excluding sentence punctuation from the end of a word.
  const wordPattern = /[.#]*[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*[+#]*/gu;
  const words = normalizedValue.match(wordPattern) ?? [];
  const keywords = normalizedQuery.match(wordPattern) ?? [];
  if (keywords.length === 0) {
    return 0;
  }

  let totalScore = 0;
  for (const keyword of keywords) {
    const score = words.reduce(
      (best, word) => Math.max(best, fuzzyWordScore(word, keyword, options)),
      0,
    );
    if (score === 0) {
      return 0;
    }
    totalScore += score;
  }

  return Math.min(99, totalScore / keywords.length);
}

function fuzzyWordScore(
  value: string,
  query: string,
  options: FuzzyOptions,
) {
  if (value.includes(query)) {
    return 100 + query.length / value.length;
  }

  if (/[.+#]/u.test(query)) {
    return 0;
  }

  // Strict matching allows typos such as "gogle" but not abbreviations.
  if (
    options.strict &&
    (query.length < 3 || query.length / value.length < 0.75)
  ) {
    return 0;
  }

  // Keep abbreviations such as "swe", but require longer fuzzy queries to
  // cover most of a single word instead of spanning an entire description.
  if (query.length >= 4 && query.length / value.length < 0.75) {
    return 0;
  }

  let queryIndex = 0;
  let score = 0;
  let streak = 0;

  for (const char of value) {
    if (char === query[queryIndex]) {
      queryIndex += 1;
      streak += 1;
      score += 3 + streak;

      if (queryIndex === query.length) {
        break;
      }
    } else {
      streak = 0;
    }
  }

  if (queryIndex !== query.length) {
    return 0;
  }

  return score / value.length;
}

export type SearchScope = "all" | "section";

// A typed search looks across active and archived applications unless the
// user narrows it to the current section; an empty search keeps the split.
export function selectSearchBase(
  applications: Application[],
  viewMode: "active" | "archive",
  rawQuery: string,
  scope: SearchScope,
) {
  const searchesAll = scope === "all" && normalizeSearchText(rawQuery) !== "";

  return {
    applications: searchesAll
      ? applications
      : applications.filter((application) =>
          viewMode === "archive"
            ? Boolean(application.archivedAt)
            : !application.archivedAt,
        ),
    searchesAll,
  };
}
