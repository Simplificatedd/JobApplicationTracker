// A separate checkout can define its own ESLint configuration. Root lint must
// never discover it, regardless of the checkout's directory name (ESLint 10).
throw new Error("Nested checkout ESLint config must not load in root validation.");
