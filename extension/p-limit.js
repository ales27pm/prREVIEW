/**
 * Creates a concurrency-limited wrapper for asynchronous function execution.
 *
 * Returns a function that, when called, schedules the provided async function to run with a maximum number of concurrent executions as specified by `concurrency`. Additional calls beyond the concurrency limit are queued and executed in order as running tasks complete. The returned function exposes properties to inspect the number of active and pending tasks, and a method to clear the pending queue.
 *
 * @param {number} concurrency - The maximum number of concurrent executions allowed (must be a positive integer).
 * @returns {function} A function that schedules async tasks with concurrency control. This function has `activeCount`, `pendingCount`, and `clearQueue` properties.
 * @throws {TypeError} If `concurrency` is not a positive integer.
 */
export default function pLimit(concurrency) {
  if (!(Number.isInteger(concurrency) && concurrency > 0)) {
    throw new TypeError("Expected `concurrency` to be a number from 1 and up");
  }

  let activeCount = 0;
  const queue = [];

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const { fn, args, resolve, reject } = queue.shift();
      run(fn, args, resolve, reject);
    }
  };

  const run = (fn, args, resolve, reject) => {
    activeCount++;
    Promise.resolve()
      .then(() => fn(...args))
      .then(resolve, reject)
      .then(next, next);
  };

  const schedule = (fn, args, resolve, reject) => {
    if (activeCount < concurrency) {
      run(fn, args, resolve, reject);
    } else {
      queue.push({ fn, args, resolve, reject });
    }
  };

  function generator(fn, ...args) {
    return new Promise((resolve, reject) => {
      schedule(fn, args, resolve, reject);
    });
  }

  Object.defineProperties(generator, {
    activeCount: { get: () => activeCount },
    pendingCount: { get: () => queue.length },
    clearQueue: {
      value() {
        queue.length = 0;
      },
    },
  });

  return generator;
}
