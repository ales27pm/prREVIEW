export async function generateSuggestion({ subgraph, mode }) {
  const results = subgraph.nodes.slice(0, 1).map((n) => ({
    file: n.file || "",
    before: n.text || "",
    after: n.text || "",
    score: Math.random(),
  }));
  return results;
}
