import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LinkifiedText } from "./LinkifiedText";

function render(text: string) {
  return renderToStaticMarkup(<LinkifiedText text={text} />);
}

describe("LinkifiedText", () => {
  it("opens links in a new tab without passing the opener", () => {
    const html = render("Apply at https://example.com/jobs/1.");

    expect(html).toBe(
      'Apply at <a class="font-medium text-primary underline underline-offset-2 [overflow-wrap:anywhere] hover:text-blue-700" href="https://example.com/jobs/1" rel="noopener noreferrer" target="_blank">https://example.com/jobs/1</a>.',
    );
  });

  it("renders HTML-like text as text", () => {
    const html = render('<b>Bold</b> <a href="javascript:alert(1)">x</a>');

    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<a");
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
  });

  it("keeps line breaks in the text", () => {
    expect(render("First line\nhttps://example.com\nLast line")).toContain(
      "First line\n<a",
    );
  });
});
