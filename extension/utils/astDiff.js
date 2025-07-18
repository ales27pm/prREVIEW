import { parse } from "recast";
import babelParser from "recast/parsers/babel.js";
import { diff as astDiff } from "ast-diff";

export function generateAstDiff(oldCode, newCode, filePath = "") {
  if (typeof oldCode !== "string" || typeof newCode !== "string") {
    return "";
  }
  try {
    const astA = parse(oldCode, { parser: babelParser });
    const astB = parse(newCode, { parser: babelParser });
    const patches = astDiff(astA, astB);
    return patches
      .map((p) => {
        const location = p.path.join(".");
        const fileInfo = filePath ? ` in ${filePath}` : "";
        return `// ${p.op} at ${location}${fileInfo}\n// New value: ${JSON.stringify(
          p.value,
        )}`;
      })
      .join("\n\n");
  } catch (err) {
    console.error("AST diff failed", err);
    return "";
  }
}
