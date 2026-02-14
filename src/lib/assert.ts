/**
 * Lightweight assertion utility. Crashes on invariant violation,
 * downgrading correctness bugs into liveness bugs per Tiger Style.
 */

/** Assert a condition is truthy. Crashes with the given message if not. */
export function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
