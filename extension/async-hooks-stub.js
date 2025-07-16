export class AsyncResource {
  bind(fn, thisArg) {
    return fn.bind(thisArg);
  }
}

export class AsyncLocalStorage {
  getStore() {
    return undefined;
  }

  run(_store, callback) {
    return callback();
  }
}
