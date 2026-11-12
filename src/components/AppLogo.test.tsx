import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppLogo } from "./AppLogo";

const markup = renderToStaticMarkup(<AppLogo />);

function rects(svg: string) {
  return [...svg.matchAll(/<rect\b([^>]*)\/?>/g)]
    .map(([, attributes]) =>
      Object.fromEntries(
        [...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
      ),
    )
    .map(({ x = "0", y = "0", width, height, rx, fill, transform = "" }) =>
      [x, y, width, height, rx, fill, transform].join(" "),
    );
}

describe("AppLogo", () => {
  it("is a labelled button that reloads into Applications", () => {
    expect(markup).toMatch(/^<button aria-label="Job Application Tracker: reload Applications"[^>]*type="button"/);
  });

  it("draws the same shapes as the favicon", () => {
    expect(rects(markup)).toEqual(rects(readFileSync("public/favicon.svg", "utf8")));
  });

  it("splits out the two documents and the clipboard for animation", () => {
    expect(markup).toContain('class="app-logo-doc app-logo-doc-red"');
    expect(markup).toContain('class="app-logo-doc app-logo-doc-yellow"');
    expect(markup).toContain('class="app-logo-clipboard"');
  });

});
