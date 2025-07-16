import { jest } from "@jest/globals";
import * as github from "../extension/githubApi.js";

// Mock the global fetch function
global.fetch = jest.fn();

describe("githubApi", () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  describe("fetchAllPRFiles", () => {
    it("should fetch all files from a single page", async () => {
      const mockFiles = [{ filename: "file1.js" }];
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockFiles,
        headers: { get: () => null },
      });

      const files = await github.fetchAllPRFiles(
        { owner: "test", repo: "test", prNumber: 1 },
        "token",
      );
      expect(files).toEqual(mockFiles);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should handle pagination correctly", async () => {
      const page1Files = Array(100).fill({ filename: "file.js" });
      const page2Files = [{ filename: "lastfile.js" }];

      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => page1Files,
          headers: { get: () => null },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => page2Files,
          headers: { get: () => null },
        });

      const files = await github.fetchAllPRFiles(
        { owner: "test", repo: "test", prNumber: 1 },
        "token",
      );
      expect(files.length).toBe(101);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("handleGitHubResponse", () => {
    it("should throw an error for a 404 response", async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => '{"message":"Not Found"}',
        headers: { get: () => null },
      });

      await expect(
        github.getPRData({ owner: "test", repo: "test", prNumber: 1 }, "token"),
      ).rejects.toThrow(
        "GitHub API: Resource not found. The repository or PR may not exist.",
      );
    });
  });
});
