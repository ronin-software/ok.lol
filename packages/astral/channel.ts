/** Push-based async iterable for reconstructing streams on the receiving side */
export interface Channel<T> {
  /** Signal completion */
  close: () => void;
  /** Signal failure */
  error: (err: Error) => void;
  /** Async iterable of pushed values */
  iterable: AsyncIterable<T>;
  /** Enqueue a value */
  push: (value: T) => void;
}

/** Create a push-based async iterable */
export function channel<T>(): Channel<T> {
  const buffer: T[] = [];
  let done = false;
  let failure: Error | undefined;
  let notify: (() => void) | undefined;

  // Wake the consumer if it's waiting
  function wake(): void {
    notify?.();
    notify = undefined;
  }

  // Block until a value is pushed, channel closes, or channel errors
  function wait(): Promise<void> {
    return new Promise((resolve) => {
      notify = resolve;
    });
  }

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          while (!buffer.length && !done && !failure) await wait();
          if (failure) throw failure;
          if (buffer.length) return { done: false, value: buffer.shift()! };
          return { done: true, value: undefined };
        },
      };
    },
  };

  return {
    close() {
      done = true;
      wake();
    },
    error(err: Error) {
      failure = err;
      wake();
    },
    iterable,
    push(value: T) {
      buffer.push(value);
      wake();
    },
  };
}
