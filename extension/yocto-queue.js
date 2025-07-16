export default class Queue {
  #items = [];

  enqueue(value) {
    this.#items.push(value);
  }

  dequeue() {
    return this.#items.shift();
  }

  peek() {
    return this.#items[0];
  }

  clear() {
    this.#items.length = 0;
  }

  get size() {
    return this.#items.length;
  }

  *[Symbol.iterator]() {
    yield* this.#items;
  }
}
