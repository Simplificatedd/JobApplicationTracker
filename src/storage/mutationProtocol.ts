// Snapshot format and mutation semantics evolve independently. Older tabs must
// reload before writing, rather than retrying whole-record upserts indefinitely.
export const MUTATION_PROTOCOL_HEADER = "X-Tracker-Mutation-Protocol";
export const MUTATION_PROTOCOL_VERSION = "1";
export const MUTATION_PROTOCOL_ERROR =
  "This tracker version can no longer save safely. Reload the tracker before making changes.";
