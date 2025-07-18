import { parse } from "recast";
import { diff as astDiff } from "ast-diff";

export function generateAstDiff(oldCode, newCode, filePath = "") {
  const astA = parse(oldCode, { parser: require("recast/parsers/babel") });
  const astB = parse(newCode, { parser: require("recast/parsers/babel") });

  const patches = astDiff(astA, astB);
  return patches
    .map((p) => {
      const location = p.path.join(".");
      return `// ${p.op} at ${location}\n// New value: ${JSON.stringify(p.value)}`;
    })
    .join("\n\n");
}
