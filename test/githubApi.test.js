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

  describe("postSummaryComment", () => {
    it("posts a summary to the PR conversation", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [],
          headers: { get: () => null },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ id: 123 }),
          headers: { get: () => null },
        });

      const result = await github.postSummaryComment({
        prDetails: { owner: "o", repo: "r", prNumber: 5 },
        token: "t",
        body: "summary",
      });

      expect(fetch).toHaveBeenNthCalledWith(
        1,
        "https://api.github.com/repos/o/r/issues/5/comments?per_page=100",
        expect.objectContaining({ headers: expect.any(Object) }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "https://api.github.com/repos/o/r/issues/5/comments",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer t" }),
          body: JSON.stringify({ body: "summary" }),
        }),
      );
      expect(result).toEqual({ id: 123 });
    });

    it("updates an existing summary comment", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [
            { id: 10, body: `${github.SUMMARY_HEADER} old summary` },
          ],
          headers: { get: () => null },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 10 }),
          headers: { get: () => null },
        });

      const result = await github.postSummaryComment({
        prDetails: { owner: "o", repo: "r", prNumber: 5 },
        token: "t",
        body: "new summary",
      });

      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "https://api.github.com/repos/o/r/issues/comments/10",
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({ Authorization: "Bearer t" }),
          body: JSON.stringify({ body: "new summary" }),
        }),
      );
      expect(result).toEqual({ id: 10 });
    });
  });

  describe("getReviewComment", () => {
    it("fetches a single review comment", async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 7, position: null }),
        headers: { get: () => null },
      });

      const result = await github.getReviewComment(
        { owner: "o", repo: "r", commentId: 7 },
        "tok",
      );

      expect(fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/o/r/pulls/comments/7",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        }),
      );
      expect(result).toEqual({ id: 7, position: null });
    });
  });
});
