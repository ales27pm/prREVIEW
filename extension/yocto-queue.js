Instead of a custom linked‐list, you can keep all existing APIs (enqueue, dequeue, peek, clear, size, iterator) with a much simpler array‐backed implementation:

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
  value;
  next;

  constructor(value) {
    this.value = value;
  }
}

export default class Queue {
  #head;
  #tail;
  #size;

  constructor() {
    this.clear();
  }

  enqueue(value) {
    const node = new Node(value);

    if (this.#head) {
      this.#tail.next = node;
      this.#tail = node;
    } else {
      this.#head = node;
      this.#tail = node;
    }

    this.#size++;
  }

  dequeue() {
    const current = this.#head;
    if (!current) {
      return;
    }

    this.#head = this.#head.next;
    this.#size--;
    return current.value;
  }

  peek() {
    return this.#head?.value;
  }

  clear() {
    this.#head = undefined;
    this.#tail = undefined;
    this.#size = 0;
  }

  get size() {
    return this.#size;
  }

  *[Symbol.iterator]() {
    let current = this.#head;

    while (current) {
      yield current.value;
      current = current.next;
    }
  }
}
