/**
 * Unit tests for Google Drive integration tool.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createReadDriveTool,
  isNeedsAuth,
  type DriveDeps,
  type DriveFile,
  type DriveResult,
} from "./drive.js";

const mockFile: DriveFile = {
  id: "file-123",
  name: "Test Document.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  modifiedTime: "2026-07-24T10:00:00.000Z",
  shared: true,
  webViewLink: "https://drive.google.com/file/d/file-123/view",
  owners: [{ displayName: "Test User", emailAddress: "test@example.com" }],
  size: "1024",
};

const mockGoogleDoc: DriveFile = {
  id: "doc-456",
  name: "Google Doc",
  mimeType: "application/vnd.google-apps.document",
  modifiedTime: "2026-07-24T12:00:00.000Z",
  shared: false,
  webViewLink: "https://docs.google.com/document/d/doc-456/edit",
};

function createMockDeps(overrides: Partial<DriveDeps> = {}): DriveDeps {
  return {
    getAccessToken: async () => "mock-access-token",
    getAuthorizationUrl: () => "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
    ...overrides,
  };
}

describe("createReadDriveTool", () => {
  describe("needsAuth handling", () => {
    it("returns needsAuth when getAccessToken throws", async () => {
      const deps = createMockDeps({
        getAccessToken: async () => {
          throw new Error("No tokens found");
        },
      });

      const tool = createReadDriveTool(deps);
      const result = (await tool.execute({ maxResults: 10, includeContent: false }, {} as never)) as DriveResult;

      assert.ok(isNeedsAuth(result));
      assert.equal(result.needsAuth, true);
      assert.ok(result.authUrl?.includes("accounts.google.com"));
      assert.ok(result.message.includes("not connected"));
    });

    it("returns needsAuth without authUrl when getAuthorizationUrl is not provided", async () => {
      const deps = createMockDeps({
        getAccessToken: async () => {
          throw new Error("No tokens");
        },
        getAuthorizationUrl: undefined,
      });

      const tool = createReadDriveTool(deps);
      const result = (await tool.execute({ maxResults: 10, includeContent: false }, {} as never)) as DriveResult;

      assert.ok(isNeedsAuth(result));
      assert.equal(result.authUrl, undefined);
      assert.ok(result.message.includes("connect your Google account"));
    });
  });

  describe("listFiles", () => {
    it("lists files with default query", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        return new Response(
          JSON.stringify({
            files: [mockFile],
            nextPageToken: "next-page",
          }),
          { status: 200 }
        );
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute({ maxResults: 20, includeContent: false }, {} as never)) as DriveResult;

      assert.ok(!("error" in result) || result.error === false);
      assert.ok("files" in result);
      assert.equal(result.files.length, 1);
      assert.equal(result.files[0].name, "Test Document.docx");
      assert.equal((result as { nextPageToken?: string }).nextPageToken, "next-page");

      assert.ok(capturedUrl.includes("/drive/v3/files"));
      assert.ok(capturedUrl.includes("pageSize=20"));
      assert.ok(capturedUrl.includes("trashed"));
      assert.equal(capturedHeaders["Authorization"], "Bearer mock-access-token");
    });

    it("lists files with custom query", async () => {
      let capturedUrl = "";

      const mockFetch = async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      await tool.execute({ q: "sharedWithMe", maxResults: 10, includeContent: false }, {} as never);

      assert.ok(capturedUrl.includes("sharedWithMe"));
    });

    it("coerces string maxResults from local models", async () => {
      let capturedUrl = "";

      const mockFetch = async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      // Local models often pass numbers as strings
      await tool.execute(
        { q: "sharedWithMe", maxResults: "10" as unknown as number, includeContent: false },
        {} as never
      );

      assert.ok(capturedUrl.includes("pageSize=10"));
    });

    it("handles API error response", async () => {
      const mockFetch = async () =>
        new Response(JSON.stringify({ error: { message: "Invalid credentials" } }), {
          status: 401,
        });

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute({ maxResults: 10, includeContent: false }, {} as never)) as DriveResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("401"));
    });
  });

  describe("getFile", () => {
    it("gets file metadata by ID", async () => {
      let capturedUrl = "";

      const mockFetch = async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify(mockFile), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute(
        { fileId: "file-123", maxResults: 20, includeContent: false },
        {} as never
      )) as DriveResult;

      assert.ok(!("error" in result) || result.error === false);
      assert.ok("file" in result);
      assert.equal(result.file.id, "file-123");
      assert.equal(result.file.name, "Test Document.docx");

      assert.ok(capturedUrl.includes("/files/file-123"));
    });

    it("gets file with content for text files", async () => {
      const textFile: DriveFile = {
        id: "text-file",
        name: "readme.txt",
        mimeType: "text/plain",
      };

      const fetchCalls: string[] = [];

      const mockFetch = async (url: string) => {
        fetchCalls.push(url);

        if (url.includes("alt=media")) {
          return new Response("Hello, this is the file content!", { status: 200 });
        }

        return new Response(JSON.stringify(textFile), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute(
        { fileId: "text-file", includeContent: true, maxResults: 20 },
        {} as never
      )) as DriveResult;

      assert.ok(!("error" in result) || result.error === false);
      assert.ok("file" in result);
      assert.equal(result.content, "Hello, this is the file content!");

      assert.equal(fetchCalls.length, 2);
      assert.ok(fetchCalls[1].includes("alt=media"));
    });

    it("exports Google Docs as plain text", async () => {
      const fetchCalls: string[] = [];

      const mockFetch = async (url: string) => {
        fetchCalls.push(url);

        if (url.includes("/export")) {
          return new Response("Exported document content", { status: 200 });
        }

        return new Response(JSON.stringify(mockGoogleDoc), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute(
        { fileId: "doc-456", includeContent: true, maxResults: 20 },
        {} as never
      )) as DriveResult;

      assert.ok("content" in result);
      assert.equal(result.content, "Exported document content");
      assert.ok(fetchCalls[1].includes("/export"));
      assert.ok(fetchCalls[1].includes("text%2Fplain"));
    });

    it("truncates large content", async () => {
      const textFile: DriveFile = {
        id: "large-file",
        name: "large.txt",
        mimeType: "text/plain",
      };

      const largeContent = "x".repeat(60000);

      const mockFetch = async (url: string) => {
        if (url.includes("alt=media")) {
          return new Response(largeContent, { status: 200 });
        }
        return new Response(JSON.stringify(textFile), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute(
        { fileId: "large-file", includeContent: true, maxResults: 20 },
        {} as never
      )) as DriveResult;

      assert.ok("content" in result && result.content);
      assert.ok(result.content.length < 60000);
      assert.ok(result.content.includes("[content truncated]"));
    });

    it("skips content for binary files", async () => {
      const binaryFile: DriveFile = {
        id: "binary-file",
        name: "image.png",
        mimeType: "image/png",
      };

      const fetchCalls: string[] = [];

      const mockFetch = async (url: string) => {
        fetchCalls.push(url);
        return new Response(JSON.stringify(binaryFile), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute(
        { fileId: "binary-file", includeContent: true, maxResults: 20 },
        {} as never
      )) as DriveResult;

      assert.ok("file" in result);
      assert.equal(result.content, undefined);
      assert.equal(fetchCalls.length, 1);
    });

    it("handles file not found", async () => {
      const mockFetch = async () =>
        new Response(JSON.stringify({ error: { message: "File not found" } }), {
          status: 404,
        });

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute(
        { fileId: "nonexistent", maxResults: 20, includeContent: false },
        {} as never
      )) as DriveResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("404"));
    });
  });

  describe("error handling", () => {
    it("catches and wraps fetch errors", async () => {
      const mockFetch = async () => {
        throw new Error("Network error");
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute({ maxResults: 10, includeContent: false }, {} as never)) as DriveResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("Network error"));
    });

    it("does not leak access tokens in error messages", async () => {
      const mockFetch = async () => {
        throw new Error("Request failed with token");
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createReadDriveTool(deps);

      const result = (await tool.execute({ maxResults: 10, includeContent: false }, {} as never)) as DriveResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(!result.message.includes("mock-access-token"));
    });
  });
});

describe("isNeedsAuth", () => {
  it("returns true for needsAuth results", () => {
    const result: DriveResult = {
      needsAuth: true,
      message: "Not connected",
    };
    assert.ok(isNeedsAuth(result));
  });

  it("returns false for success results", () => {
    const result: DriveResult = {
      error: false,
      files: [],
    };
    assert.ok(!isNeedsAuth(result));
  });

  it("returns false for error results", () => {
    const result: DriveResult = {
      error: true,
      message: "API error",
    };
    assert.ok(!isNeedsAuth(result));
  });
});
