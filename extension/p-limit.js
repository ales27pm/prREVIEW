You can drop both the `AsyncResource` shim and the custom `yocto-queue` import and replace them with a simple array-based queue and microtask scheduling. This preserves all existing functionality (activeCount, pendingCount, clearQueue) but removes the hook-specific plumbing:

```js
export default function pLimit(concurrency) {
  if (!(Number.isInteger(concurrency) && concurrency > 0)) {
    throw new TypeError("Expected `concurrency` to be a number from 1 and up");
  }

  let activeCount = 0;
  const queue = []; // simple array instead of Queue()

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const { fn, args, resolve, reject } = queue.shift();
      run(fn, args, resolve, reject);
    }
  };

  const run = (fn, args, resolve, reject) => {
    activeCount++;
    // ensure fn() runs async and we always clean up activeCount
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
import { AsyncResource } from "./async-hooks-stub.js";

export default function pLimit(concurrency) {
  if (
    !(
      (Number.isInteger(concurrency) ||
        concurrency === Number.POSITIVE_INFINITY) &&
      concurrency > 0
    )
  ) {
    throw new TypeError("Expected `concurrency` to be a number from 1 and up");
  }

  const queue = new Queue();
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.size > 0) {
      queue.dequeue()();
    }
  };

  const run = async (fn, resolve, args) => {
    activeCount++;
    const result = (async () => fn(...args))();
    resolve(result);
    try {
      await result;
    } catch {}
    next();
  };

  const enqueue = (fn, resolve, args) => {
    queue.enqueue(AsyncResource.bind(run.bind(undefined, fn, resolve, args)));
    (async () => {
      await Promise.resolve();
      if (activeCount < concurrency && queue.size > 0) {
        queue.dequeue()();
      }
    })();
  };

  const generator = (fn, ...args) =>
    new Promise((resolve) => {
      enqueue(fn, resolve, args);
    });

  Object.defineProperties(generator, {
    activeCount: {
      get: () => activeCount,
    },
    pendingCount: {
      get: () => queue.size,
    },
    clearQueue: {
      value() {
        queue.clear();
      },
    },
  });

  return generator;
}
