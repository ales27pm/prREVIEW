export async function generateSuggestion({ subgraph, mode }) {
  const results = subgraph.nodes.slice(0, 1).map((n) => ({
    file: n.file || "",
    before: n.text || "",
    after: n.text || "",
    // TODO: Replace with a meaningful scoring metric. Using 0 as a placeholder for now.
    score: 0,
  }));
  return results;
}
