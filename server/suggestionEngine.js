export async function generateSuggestion({ subgraph, mode }) {
  if (!subgraph?.nodes?.length) {
    return [];
  }

  return subgraph.nodes.map((n) => ({
    file: n.file || "",
    before: n.text || "",
    after: generateImprovement(n.text || "", mode),
    score: calculateRelevanceScore(n, mode),
  }));
}

function generateImprovement(text, mode) {
  switch (mode) {
    case "performance":
      return `${text}\n// TODO: optimize performance`;
    case "security":
      return `${text}\n// TODO: address security concern`;
    case "test":
      return `${text}\n// TODO: add tests`;
    default:
      return text;
  }
}

function calculateRelevanceScore(node, _mode) {
  const len = (node.text || "").length;
  return Math.min(1, len / 1000);
}
