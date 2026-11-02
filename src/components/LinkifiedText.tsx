import { Fragment } from "react";
import { splitTextIntoLinkParts } from "../lib/urls";

// Renders plain text with its http(s) URLs as links. Text is never parsed as
// HTML or Markdown; the caller keeps line breaks with whitespace-pre-wrap.
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {splitTextIntoLinkParts(text).map((part, index) =>
        part.type === "link" ? (
          <a
            className="font-medium text-primary underline underline-offset-2 [overflow-wrap:anywhere] hover:text-blue-700"
            href={part.href}
            key={index}
            rel="noopener noreferrer"
            target="_blank"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
