import type { Application } from "../../types/application";

interface RankedApplication {
  application: Application;
  rank: number;
  score: number;
}

export function searchApplications(
  applications: Application[],
  rawQuery: string,
) {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    return applications;
  }

  return applications
    .map((application): RankedApplication | null => {
      const titleScore = fuzzyScore(application.jobTitle, query);
      const descriptionScore = fuzzyScore(application.jobDescription, query);

      if (titleScore === 0 && descriptionScore === 0) {
        return null;
      }

      if (titleScore > 0) {
        return {
          application,
          rank: 0,
          score: titleScore,
        };
      }

      return {
        application,
        rank: 1,
        score: descriptionScore,
      };
    })
    .filter((result): result is RankedApplication => result !== null)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return right.score - left.score;
    })
    .map((result) => result.application);
}

export function fuzzyScore(value: string, query: string) {
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
      (best, word) => Math.max(best, fuzzyWordScore(word, keyword)),
      0,
    );
    if (score === 0) {
      return 0;
    }
    totalScore += score;
  }

  return Math.min(99, totalScore / keywords.length);
}

function fuzzyWordScore(value: string, query: string) {
  if (value.includes(query)) {
    return 100 + query.length / value.length;
  }

  if (/[.+#]/u.test(query)) {
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
