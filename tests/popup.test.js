const { extractChangesFromDiff } = require("../extension/popup");

describe("extractChangesFromDiff", () => {
  test("handles multiple hunks and resets line numbers", () => {
    const patch = [
      "@@ -1,2 +1,2 @@",
      " line1",
      "+addA",
      " line2",
      "@@ -5 +5,2 @@",
      " line5",
      "+addB",
      "+addC",
    ].join("\n");

    const result = extractChangesFromDiff([{ filename: "a.js", patch }]);
    expect(result).toEqual([
      { file: "a.js", line: 2 },
      { file: "a.js", line: 6 },
      { file: "a.js", line: 7 },
    ]);
  });

  test("parses hunk headers with and without count", () => {
    const patch = [
      "@@ -1 +1 @@",
      "+add1",
      " line",
      "@@ -4,2 +5 @@",
      "-rm",
      "+add2",
      " context",
    ].join("\n");

    const result = extractChangesFromDiff([{ filename: "b.js", patch }]);
    expect(result).toEqual([
      { file: "b.js", line: 1 },
      { file: "b.js", line: 5 },
    ]);
  });

  test("returns no changes for context-only hunks", () => {
    const patch = ["@@ -1,2 +1,2 @@", " line1", " line2"].join("\n");
    const result = extractChangesFromDiff([{ filename: "c.js", patch }]);
    expect(result).toEqual([]);
  });

  test("handles empty or missing patch", () => {
    const data = [{ filename: "d.js", patch: "" }, { filename: "e.js" }];
    const result = extractChangesFromDiff(data);
    expect(result).toEqual([]);
  });

  test("processes mixed additions and removals correctly", () => {
    const patch = [
      "@@ -1,4 +1,4 @@",
      "-old1",
      "+add1",
      " ctx",
      "-old2",
      "+add2",
    ].join("\n");

    const result = extractChangesFromDiff([{ filename: "f.js", patch }]);
    expect(result).toEqual([
      { file: "f.js", line: 1 },
      { file: "f.js", line: 3 },
    ]);
  });
});
