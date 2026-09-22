export interface MutationQueue {
  run<Value>(operation: () => Promise<Value>): Promise<Value>;
}

export function createMutationQueue(): MutationQueue {
  let tail = Promise.resolve();

  return {
    run<Value>(operation: () => Promise<Value>) {
      const result = tail.then(operation, operation);

      tail = result.then(
        () => undefined,
        () => undefined,
      );

      return result;
    },
  };
}
