const { extractPRDetails } = require("../extension/popup.js");

describe("extractPRDetails", () => {
  test("should extract details from a valid GitHub PR URL", () => {
    const url = "https://github.com/owner/repo-name/pull/123";
    const expected = { owner: "owner", repo: "repo-name", prNumber: "123" };
    expect(extractPRDetails(url)).toEqual(expected);
  });

  test("should extract details from a URL with extra path segments", () => {
    const url = "https://github.com/another-owner/another-repo/pull/456/files";
    const expected = {
      owner: "another-owner",
      repo: "another-repo",
      prNumber: "456",
    };
    expect(extractPRDetails(url)).toEqual(expected);
  });

  test("should return null for a non-PR GitHub URL", () => {
    const url = "https://github.com/owner/repo-name/issues/123";
    expect(extractPRDetails(url)).toBeNull();
  });

  test("should return null for a URL from a different domain", () => {
    const url = "https://gitlab.com/owner/repo-name/pull/123";
    expect(extractPRDetails(url)).toBeNull();
  });

  test("should return null for an invalid or malformed URL", () => {
    const url = "not a valid url";
    expect(extractPRDetails(url)).toBeNull();
  });

  test("should return null for the main repository page", () => {
    const url = "https://github.com/owner/repo-name";
    expect(extractPRDetails(url)).toBeNull();
  });
});
