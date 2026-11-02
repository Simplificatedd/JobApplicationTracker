import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ANALYTICS_SETTINGS, DEFAULT_USER_SETTINGS } from "../../lib/domain";
import { application } from "../../test/assessmentFixtures";
import { AnalyticsPage } from "./AnalyticsPage";

function renderPage() {
  return renderToStaticMarkup(
    <AnalyticsPage
      activities={[]}
      analyticsSettings={DEFAULT_ANALYTICS_SETTINGS}
      applications={[application]}
      assessments={[]}
      interviews={[]}
      onUpdateAnalyticsSettings={vi.fn()}
      userSettings={DEFAULT_USER_SETTINGS}
    />,
  );
}

function countMatches(text: string, part: string) {
  return text.split(part).length - 1;
}

// The markup of the key metrics section.
function keyMetrics() {
  const markup = renderPage();
  const start = markup.indexOf('aria-label="Key metrics"');
  return markup.slice(start, markup.indexOf("</section>", start));
}

describe("phone stat tiles", () => {
  it("lets tile labels and details wrap below sm instead of cutting them off", () => {
    const metrics = keyMetrics();

    // Each tile has a label, a value and a detail paragraph.
    const paragraphs = [...metrics.matchAll(/<p class="([^"]*)"/g)].map((match) => match[1].split(" "));
    expect(paragraphs).toHaveLength(12);

    paragraphs.forEach((classes, index) => {
      if (index % 3 === 1) return;
      expect(classes).toContain("truncate");
      expect(classes).toContain("max-sm:whitespace-normal");
    });
  });

  it("hides tile decorations below sm and adds no wrapper to plain tiles", () => {
    const metrics = keyMetrics();

    const wrapper = '<div class="flex shrink-0 max-sm:hidden">';

    // One application draws only the response-rate ring, so the other three
    // tiles must not get an empty wrapper (it would add a flex gap).
    expect(countMatches(metrics, wrapper)).toBe(1);
    expect(metrics.slice(metrics.indexOf(wrapper))).toMatch(/^<div[^>]*><svg[^>]*-rotate-90/);
  });
});

describe("phone key metrics", () => {
  it("lays the key metrics out two by two until xl", () => {
    const classes = keyMetrics().match(/^aria-label="Key metrics" class="([^"]*)"/)![1].split(" ");

    expect(classes).toEqual(expect.arrayContaining(["grid", "grid-cols-2", "xl:grid-cols-4"]));
    expect(classes).not.toContain("sm:grid-cols-2");
  });

  it("top-aligns tile content in the equal-height phone rows", () => {
    expect(countMatches(keyMetrics(), "max-sm:items-start")).toBe(4);
  });
});

describe("phone analytics header", () => {
  it("gives Include archived and Customize 44px on phones", () => {
    const markup = renderPage();
    const includeArchived = markup.slice(markup.lastIndexOf("<label", markup.indexOf("Include archived")));
    const customize = markup.slice(markup.lastIndexOf("<button", markup.indexOf("Customize")));

    expect(includeArchived.slice(0, includeArchived.indexOf(">"))).toContain("max-md:h-11");
    expect(customize.slice(0, customize.indexOf(">"))).toContain("max-md:h-11");
  });
});
