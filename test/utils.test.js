import { extractPRDetails } from '../extension/utils.js';

describe("extractPRDetails", () => {
  test("should extract details from a valid GitHub PR URL", () => {
    const url = "https://github.com/owner/repo-name/pull/123";
    const expected = { owner: "owner", repo: "repo-name", prNumber: 123 };
    expect(extractPRDetails(url)).toEqual(expected);
  });

  test("should extract details from a URL with extra path segments", () => {
    const url = "https://github.com/another-owner/another-repo/pull/456/files";
    const expected = {
      owner: "another-owner",
      repo: "another-repo",
      prNumber: 456,
    };
    expect(extractPRDetails(url)).toEqual(expected);
  });

  test("should handle URLs with trailing slashes", () => {
    const url = "https://github.com/owner/repo-name/pull/789/";
    const expected = { owner: "owner", repo: "repo-name", prNumber: 789 };
    expect(extractPRDetails(url)).toEqual(expected);
  });

  test("should handle URLs with query parameters", () => {
    const url = "https://github.com/owner/repo-name/pull/1011?param=true";
    const expected = { owner: "owner", repo: "repo-name", prNumber: 1011 };
    expect(extractPRDetails(url)).toEqual(expected);
  });

  test("should handle PR numbers with leading zeros", () => {
    const url = "https://github.com/owner/repo-name/pull/00042";
    const expected = { owner: "owner", repo: "repo-name", prNumber: 42 };
    expect(extractPRDetails(url)).toEqual(expected);
  });

  test("should handle very large PR numbers", () => {
    const url = "https://github.com/owner/repo-name/pull/1234567890123";
    const expected = {
      owner: "owner",
      repo: "repo-name",
      prNumber: 1234567890123,
    };
    expect(extractPRDetails(url)).toEqual(expected);
  });

  test("should handle URLs with hash fragments", () => {
    const url = "https://github.com/owner/repo-name/pull/2022#discussion";
    const expected = { owner: "owner", repo: "repo-name", prNumber: 2022 };
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
