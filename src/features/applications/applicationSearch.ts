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

      if (titleScore >= descriptionScore) {
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
  const normalizedValue = value.toLowerCase();

  if (!normalizedValue || !query) {
    return 0;
  }

  if (normalizedValue.includes(query)) {
    return 100 + query.length / normalizedValue.length;
  }

  let queryIndex = 0;
  let score = 0;
  let streak = 0;

  for (const char of normalizedValue) {
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

  return score / normalizedValue.length;
}
