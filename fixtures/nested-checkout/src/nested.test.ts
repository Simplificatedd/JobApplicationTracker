// This represents a separate checkout with its own TypeScript configuration.
// Root validation must never discover or execute this sentinel test.
throw new Error("Nested checkout tests must not run in root validation.");
