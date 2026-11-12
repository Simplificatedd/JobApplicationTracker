import { useState } from "react";
import { APP_NAME } from "../lib/constants";

// Inline copy of public/favicon.svg so the documents and the clipboard can be
// animated separately. Keep the shapes in sync with the favicon.
export function AppLogo({ className = "" }: { className?: string }) {
  const [bouncing, setBouncing] = useState(false);

  return (
    <button
      aria-label={`${APP_NAME}: reload Applications`}
      // The global button:focus-visible rule draws the focus ring.
      className={`app-logo rounded-lg ${
        bouncing ? "app-logo-bouncing" : ""
      } ${className}`}
      // The current page lives in memory, so a reload always opens Applications.
      onClick={() => window.location.reload()}
      onFocus={() => setBouncing(true)}
      onPointerEnter={() => setBouncing(true)}
      type="button"
    >
      <svg aria-hidden="true" className="size-full overflow-visible" viewBox="0 0 32 32">
        <rect fill="#2563eb" height="32" rx="8" width="32" />
        <g stroke="#2563eb" strokeWidth="1.2">
          <g className="app-logo-doc app-logo-doc-red">
            <rect fill="#ef4444" height="10" rx="1.5" transform="rotate(-10 14 10)" width="9" x="10" y="4.5" />
          </g>
          <g
            className="app-logo-doc app-logo-doc-yellow"
            // The yellow document finishes last, so its end closes the bounce.
            onAnimationEnd={() => setBouncing(false)}
          >
            <rect fill="#facc15" height="10" rx="1.5" transform="rotate(8 18 10)" width="9" x="14" y="4" />
          </g>
        </g>
        <g className="app-logo-clipboard">
          <rect fill="#fff" height="15" rx="2" width="18" x="7" y="11" />
          <rect fill="#86efac" height="15" rx="1.5" width="3.5" x="7" y="11" />
          <rect fill="#22c55e" height="2" rx="1" width="9" x="13" y="16" />
          <rect fill="#22c55e" height="2" rx="1" width="6" x="13" y="19.5" />
        </g>
      </svg>
    </button>
  );
}
