export class GraphBuilder {
  constructor() {
    this._nodes = new Map();
    this._edges = [];
  }

  addNode(node) {
    if (!this._nodes.has(node.id)) {
      this._nodes.set(node.id, node);
    }
  }

  addEdge(edge) {
    this._edges.push(edge);
  }

  build() {
    return { nodes: Array.from(this._nodes.values()), edges: this._edges };
  }
}
