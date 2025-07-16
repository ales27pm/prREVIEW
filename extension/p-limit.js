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
