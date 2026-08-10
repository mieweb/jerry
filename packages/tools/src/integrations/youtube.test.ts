/**
 * Unit tests for YouTube integration tools.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPostYoutubeTool,
  createFetchYoutubeTool,
  createFetchYoutubeTranscriptTool,
  isYouTubeNeedsAuth,
  type YoutubeDeps,
  type VideoFileData,
  type YouTubeResult,
  type YouTubeTranscriptResult,
} from "./youtube.js";

const mockVideoFileData: VideoFileData = {
  bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
  mimeType: "video/mp4",
  size: 4,
};

const mockVideoResponse = {
  id: "video-123",
  snippet: {
    title: "Test Video",
    description: "A test video",
    channelId: "channel-456",
    channelTitle: "Test Channel",
    publishedAt: "2026-07-24T10:00:00Z",
    thumbnails: { default: { url: "https://img.youtube.com/vi/video-123/default.jpg" } },
  },
  status: {
    privacyStatus: "private",
  },
};

const mockSearchResult = {
  items: [
    {
      id: { videoId: "search-1" },
      snippet: {
        title: "Search Result 1",
        description: "First result",
        channelId: "ch-1",
        channelTitle: "Channel 1",
        publishedAt: "2026-07-20T10:00:00Z",
      },
    },
    {
      id: { videoId: "search-2" },
      snippet: {
        title: "Search Result 2",
        description: "Second result",
        channelId: "ch-2",
        channelTitle: "Channel 2",
        publishedAt: "2026-07-21T10:00:00Z",
      },
    },
  ],
  nextPageToken: "next-page-token",
};

function createMockDeps(overrides: Partial<YoutubeDeps> = {}): YoutubeDeps {
  return {
    getAccessToken: async () => "mock-access-token",
    getAuthorizationUrl: () => "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
    readVideoFile: async () => mockVideoFileData,
    ...overrides,
  };
}

describe("createPostYoutubeTool", () => {
  describe("needsAuth handling", () => {
    it("returns needsAuth when getAccessToken throws", async () => {
      const deps = createMockDeps({
        getAccessToken: async () => {
          throw new Error("No tokens found");
        },
      });

      const tool = createPostYoutubeTool(deps);
      const result = (await tool.execute(
        { filePath: "/test.mp4", title: "Test", privacyStatus: "private" },
        {} as never
      )) as YouTubeResult;

      assert.ok(isYouTubeNeedsAuth(result));
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

      const tool = createPostYoutubeTool(deps);
      const result = (await tool.execute(
        { filePath: "/test.mp4", title: "Test", privacyStatus: "private" },
        {} as never
      )) as YouTubeResult;

      assert.ok(isYouTubeNeedsAuth(result));
      assert.equal(result.authUrl, undefined);
      assert.ok(result.message.includes("connect your Google account"));
    });
  });

  describe("readVideoFile not configured", () => {
    it("returns error when readVideoFile is not provided", async () => {
      const deps = createMockDeps({ readVideoFile: undefined });

      const tool = createPostYoutubeTool(deps);
      const result = (await tool.execute(
        { filePath: "/test.mp4", title: "Test", privacyStatus: "private" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("not available"));
      assert.ok(result.message.includes("not configured"));
    });
  });

  describe("file reading errors", () => {
    it("returns error when file read fails", async () => {
      const deps = createMockDeps({
        readVideoFile: async () => {
          throw new Error("File not found: /nonexistent.mp4");
        },
      });

      const tool = createPostYoutubeTool(deps);
      const result = (await tool.execute(
        { filePath: "/nonexistent.mp4", title: "Test", privacyStatus: "private" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("Failed to read video file"));
      assert.ok(result.message.includes("File not found"));
    });
  });

  describe("file size validation", () => {
    it("rejects files over 100MB before network call", async () => {
      const largeFileData: VideoFileData = {
        bytes: new Uint8Array(1),
        mimeType: "video/mp4",
        size: 101 * 1024 * 1024,
      };

      let fetchCalled = false;
      const mockFetch = async () => {
        fetchCalled = true;
        return new Response("{}", { status: 200 });
      };

      const deps = createMockDeps({
        readVideoFile: async () => largeFileData,
        fetchFn: mockFetch as typeof fetch,
      });

      const tool = createPostYoutubeTool(deps);
      const result = (await tool.execute(
        { filePath: "/large.mp4", title: "Test", privacyStatus: "private" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("too large"));
      assert.ok(result.message.includes("100MB"));
      assert.equal(fetchCalled, false);
    });
  });

  describe("upload success", () => {
    it("uploads video with multipart request", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: Uint8Array | null = null;

      const mockFetch = async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        if (init?.body instanceof Uint8Array) {
          capturedBody = init.body;
        }
        return new Response(
          JSON.stringify({
            id: "uploaded-123",
            snippet: { title: "Test Upload" },
            status: { privacyStatus: "private" },
          }),
          { status: 200 }
        );
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createPostYoutubeTool(deps);

      const result = (await tool.execute(
        {
          filePath: "/test.mp4",
          title: "Test Upload",
          description: "Test description",
          privacyStatus: "private",
          tags: ["test", "upload"],
        },
        {} as never
      )) as YouTubeResult;

      assert.ok(!("error" in result) || result.error === false);
      assert.ok("videoId" in result && "privacyStatus" in result);
      assert.equal(result.videoId, "uploaded-123");
      assert.equal(result.title, "Test Upload");
      assert.equal(result.privacyStatus, "private");
      assert.equal(result.url, "https://www.youtube.com/watch?v=uploaded-123");

      assert.ok(capturedUrl.includes("/upload/youtube/v3/videos"));
      assert.ok(capturedUrl.includes("uploadType=multipart"));
      assert.ok(capturedUrl.includes("part=snippet,status"));
      assert.equal(capturedHeaders["Authorization"], "Bearer mock-access-token");
      assert.ok(capturedHeaders["Content-Type"]?.includes("multipart/related"));

      assert.ok(capturedBody !== null);
      const bodyText = new TextDecoder().decode(capturedBody);
      assert.ok(bodyText.includes("Test Upload"));
      assert.ok(bodyText.includes("Test description"));
      assert.ok(bodyText.includes("video/mp4"));
    });

    it("uses private privacy by default", async () => {
      let capturedBody: Uint8Array | null = null;

      const mockFetch = async (_url: string, init?: RequestInit) => {
        if (init?.body instanceof Uint8Array) {
          capturedBody = init.body;
        }
        return new Response(
          JSON.stringify({
            id: "vid-1",
            snippet: { title: "Test" },
            status: { privacyStatus: "private" },
          }),
          { status: 200 }
        );
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createPostYoutubeTool(deps);

      await tool.execute(
        { filePath: "/test.mp4", title: "Test", privacyStatus: "private" },
        {} as never
      );

      const bodyText = new TextDecoder().decode(capturedBody!);
      assert.ok(bodyText.includes('"privacyStatus":"private"'));
    });
  });

  describe("upload errors", () => {
    it("handles API error response", async () => {
      const mockFetch = async () =>
        new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), {
          status: 403,
        });

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createPostYoutubeTool(deps);

      const result = (await tool.execute(
        { filePath: "/test.mp4", title: "Test", privacyStatus: "private" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("403"));
    });

    it("does not leak access tokens in error messages", async () => {
      const mockFetch = async () => {
        throw new Error("Request failed with token");
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createPostYoutubeTool(deps);

      const result = (await tool.execute(
        { filePath: "/test.mp4", title: "Test", privacyStatus: "private" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(!result.message.includes("mock-access-token"));
    });
  });
});

describe("createFetchYoutubeTool", () => {
  describe("needsAuth handling", () => {
    it("returns needsAuth when getAccessToken throws", async () => {
      const deps = createMockDeps({
        getAccessToken: async () => {
          throw new Error("No tokens found");
        },
      });

      const tool = createFetchYoutubeTool(deps);
      const result = (await tool.execute({ maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok(isYouTubeNeedsAuth(result));
      assert.equal(result.needsAuth, true);
      assert.ok(result.authUrl?.includes("accounts.google.com"));
    });

    it("returns needsAuth without authUrl when getAuthorizationUrl is not provided", async () => {
      const deps = createMockDeps({
        getAccessToken: async () => {
          throw new Error("No tokens");
        },
        getAuthorizationUrl: undefined,
      });

      const tool = createFetchYoutubeTool(deps);
      const result = (await tool.execute({ maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok(isYouTubeNeedsAuth(result));
      assert.equal(result.authUrl, undefined);
    });
  });

  describe("getVideo", () => {
    it("gets video metadata by ID", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = (init?.headers as Record<string, string>) ?? {};
        return new Response(JSON.stringify({ items: [mockVideoResponse] }), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      const result = (await tool.execute({ videoId: "video-123", maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok(!("error" in result) || result.error === false);
      assert.ok("videos" in result);
      assert.equal(result.videos.length, 1);
      assert.equal(result.videos[0].id, "video-123");
      assert.equal(result.videos[0].title, "Test Video");
      assert.equal(result.videos[0].privacyStatus, "private");
      assert.equal(result.videos[0].url, "https://www.youtube.com/watch?v=video-123");

      assert.ok(capturedUrl.includes("/youtube/v3/videos"));
      assert.ok(capturedUrl.includes("id=video-123"));
      assert.ok(capturedUrl.includes("part=snippet") && capturedUrl.includes("status"));
      assert.equal(capturedHeaders["Authorization"], "Bearer mock-access-token");
    });

    it("treats literal null strings as omitted optional arguments", async () => {
      let capturedUrl = "";
      const mockFetch = async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ items: [mockVideoResponse] }), {
          status: 200,
        });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      await tool.execute(
        {
          videoId: "jFW_SmeLRrY",
          q: "null",
          maxResults: "null",
        } as never,
        {} as never
      );

      assert.ok(capturedUrl.includes("/youtube/v3/videos"));
      assert.ok(capturedUrl.includes("id=jFW_SmeLRrY"));
    });

    it("returns empty array when video not found", async () => {
      const mockFetch = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      const result = (await tool.execute({ videoId: "nonexistent", maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok("videos" in result);
      assert.equal(result.videos.length, 0);
    });

    it("handles API error response", async () => {
      const mockFetch = async () =>
        new Response(JSON.stringify({ error: { message: "Video not found" } }), {
          status: 404,
        });

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      const result = (await tool.execute({ videoId: "bad-id", maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("404"));
    });
  });

  describe("searchVideos", () => {
    it("searches videos with query", async () => {
      let capturedUrl = "";

      const mockFetch = async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify(mockSearchResult), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      const result = (await tool.execute({ q: "test query", maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok("videos" in result);
      assert.equal(result.videos.length, 2);
      assert.equal(result.videos[0].id, "search-1");
      assert.equal(result.videos[0].title, "Search Result 1");
      assert.equal(result.videos[1].id, "search-2");
      assert.equal(result.nextPageToken, "next-page-token");

      assert.ok(capturedUrl.includes("/youtube/v3/search"));
      assert.ok(capturedUrl.includes("q=test+query") || capturedUrl.includes("q=test%20query"));
      assert.ok(capturedUrl.includes("type=video"));
      assert.ok(capturedUrl.includes("forMine=true"));
      assert.ok(capturedUrl.includes("maxResults=10"));
    });

    it("accepts null videoId/q from local models (lists uploads)", async () => {
      const fetchCalls: string[] = [];

      const mockFetch = async (url: string) => {
        fetchCalls.push(url);
        if (url.includes("/channels")) {
          return new Response(
            JSON.stringify({
              items: [{ contentDetails: { relatedPlaylists: { uploads: "UU123" } } }],
            }),
            { status: 200 }
          );
        }
        if (url.includes("/playlistItems")) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      const result = (await tool.execute(
        { videoId: null, q: null, maxResults: 50 } as never,
        {} as never
      )) as YouTubeResult;

      assert.ok("videos" in result);
      assert.ok(fetchCalls.some((url) => url.includes("/channels")));
    });

    it("respects maxResults parameter", async () => {
      let capturedUrl = "";

      const mockFetch = async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      await tool.execute({ q: "test", maxResults: 25 }, {} as never);

      assert.ok(capturedUrl.includes("maxResults=25"));
    });
  });

  describe("listMyVideos", () => {
    it("lists user's uploaded videos when no videoId or q provided", async () => {
      const fetchCalls: string[] = [];

      const mockFetch = async (url: string) => {
        fetchCalls.push(url);

        if (url.includes("/channels")) {
          return new Response(
            JSON.stringify({
              items: [{ contentDetails: { relatedPlaylists: { uploads: "UU123" } } }],
            }),
            { status: 200 }
          );
        }

        if (url.includes("/playlistItems")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  snippet: {
                    resourceId: { videoId: "my-vid-1" },
                    title: "My Video 1",
                    description: "My first video",
                    channelTitle: "My Channel",
                  },
                  status: { privacyStatus: "public" },
                },
              ],
            }),
            { status: 200 }
          );
        }

        return new Response("{}", { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      const result = (await tool.execute({ maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok("videos" in result);
      assert.equal(result.videos.length, 1);
      assert.equal(result.videos[0].id, "my-vid-1");
      assert.equal(result.videos[0].title, "My Video 1");

      assert.ok(fetchCalls.some((url) => url.includes("/channels")));
      assert.ok(fetchCalls.some((url) => url.includes("/playlistItems")));
    });

    it("paginates through every upload when listAll is true", async () => {
      const playlistCalls: string[] = [];
      const mockFetch = async (url: string) => {
        if (url.includes("/channels")) {
          return new Response(
            JSON.stringify({
              items: [{ contentDetails: { relatedPlaylists: { uploads: "UU123" } } }],
            }),
            { status: 200 }
          );
        }

        playlistCalls.push(url);
        const isSecondPage = url.includes("pageToken=page-2");
        return new Response(
          JSON.stringify({
            items: [
              {
                snippet: {
                  resourceId: {
                    videoId: isSecondPage ? "private-short" : "public-video",
                  },
                  title: isSecondPage ? "Private Short" : "Public Video",
                },
                status: {
                  privacyStatus: isSecondPage ? "private" : "public",
                },
              },
            ],
            nextPageToken: isSecondPage ? undefined : "page-2",
          }),
          { status: 200 }
        );
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);
      const result = (await tool.execute(
        { maxResults: 10, listAll: "true" } as never,
        {} as never
      )) as YouTubeResult;

      assert.ok("videos" in result);
      assert.deepEqual(
        result.videos.map((video) => [video.id, video.privacyStatus]),
        [
          ["public-video", "public"],
          ["private-short", "private"],
        ]
      );
      assert.equal(playlistCalls.length, 2);
      assert.ok(playlistCalls[1].includes("pageToken=page-2"));
      assert.equal(result.nextPageToken, undefined);
    });

    it("returns empty array when user has no channel", async () => {
      const mockFetch = async (url: string) => {
        if (url.includes("/channels")) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      const result = (await tool.execute({ maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok("videos" in result);
      assert.equal(result.videos.length, 0);
    });
  });

  describe("error handling", () => {
    it("catches and wraps fetch errors", async () => {
      const mockFetch = async () => {
        throw new Error("Network error");
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      const result = (await tool.execute({ maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("Network error"));
    });

    it("does not leak access tokens in error messages", async () => {
      const mockFetch = async () => {
        throw new Error("Request failed with token");
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTool(deps);

      const result = (await tool.execute({ maxResults: 10 }, {} as never)) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(!result.message.includes("mock-access-token"));
    });
  });
});

const mockSrtTranscript = `1
00:00:00,000 --> 00:00:02,500
Hello and welcome

2
00:00:02,500 --> 00:00:05,000
to this video.
`;

describe("createFetchYoutubeTranscriptTool", () => {
  describe("needsAuth handling", () => {
    it("returns needsAuth when getAccessToken throws", async () => {
      const deps = createMockDeps({
        getAccessToken: async () => {
          throw new Error("No tokens found");
        },
      });

      const tool = createFetchYoutubeTranscriptTool(deps);
      const result = (await tool.execute(
        { videoId: "video-123" },
        {} as never
      )) as YouTubeResult;

      assert.ok(isYouTubeNeedsAuth(result));
      assert.equal(result.needsAuth, true);
      assert.ok(result.authUrl?.includes("accounts.google.com"));
    });
  });

  describe("happy path", () => {
    it("lists caption tracks and downloads the matching one as a transcript", async () => {
      const calls: string[] = [];
      const mockFetch = async (url: string) => {
        calls.push(url);
        if (url.includes("/captions?")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "track-en",
                  snippet: { language: "en", trackKind: "standard" },
                },
                {
                  id: "track-fr",
                  snippet: { language: "fr", trackKind: "standard" },
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.includes("/captions/track-en")) {
          return new Response(mockSrtTranscript, { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { videoId: "video-123", language: "en" },
        {} as never
      )) as YouTubeTranscriptResult;

      assert.equal(result.error, false);
      assert.equal(result.videoId, "video-123");
      assert.equal(result.language, "en");
      assert.equal(result.trackKind, "standard");
      assert.equal(result.transcript, "Hello and welcome to this video.");
      assert.equal(result.segments.length, 2);
      assert.equal(result.segments[0].start, 0);
      assert.equal(result.segments[0].duration, 2.5);
      assert.equal(result.segments[0].text, "Hello and welcome");

      assert.ok(calls.some((url) => url.includes("/captions?") && url.includes("videoId=video-123")));
      assert.ok(calls.some((url) => url.includes("/captions/track-en") && url.includes("tfmt=srt")));
    });

    it("falls back to an auto-generated (asr) track when the language isn't found", async () => {
      const mockFetch = async (url: string) => {
        if (url.includes("/captions?")) {
          return new Response(
            JSON.stringify({
              items: [
                { id: "track-manual", snippet: { language: "fr", trackKind: "standard" } },
                { id: "track-asr", snippet: { language: "en", trackKind: "asr" } },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.includes("/captions/track-asr")) {
          return new Response(mockSrtTranscript, { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { videoId: "video-123", language: "de" },
        {} as never
      )) as YouTubeTranscriptResult;

      assert.equal(result.error, false);
      assert.equal(result.trackKind, "asr");
    });

    it("falls back to the first track when no language or asr track matches", async () => {
      const mockFetch = async (url: string) => {
        if (url.includes("/captions?")) {
          return new Response(
            JSON.stringify({
              items: [{ id: "track-only", snippet: { language: "fr", trackKind: "standard" } }],
            }),
            { status: 200 }
          );
        }
        if (url.includes("/captions/track-only")) {
          return new Response(mockSrtTranscript, { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { videoId: "video-123" },
        {} as never
      )) as YouTubeTranscriptResult;

      assert.equal(result.error, false);
      assert.equal(result.language, "fr");
    });
  });

  describe("resolving by query (no videoId)", () => {
    /** Mocks /channels + /playlistItems (recent uploads) like the real API. */
    function mockUploadsFetch(
      uploads: Array<{ videoId: string; title: string }>,
      extra?: (url: string) => Response | undefined
    ) {
      const calls: string[] = [];
      const fetchFn = async (url: string) => {
        calls.push(url);
        const extraResponse = extra?.(url);
        if (extraResponse) return extraResponse;
        if (url.includes("/channels")) {
          return new Response(
            JSON.stringify({
              items: [{ contentDetails: { relatedPlaylists: { uploads: "UU123" } } }],
            }),
            { status: 200 }
          );
        }
        if (url.includes("/playlistItems")) {
          return new Response(
            JSON.stringify({
              items: uploads.map((v) => ({
                snippet: {
                  resourceId: { videoId: v.videoId },
                  title: v.title,
                  description: "",
                  channelTitle: "My Channel",
                },
                status: { privacyStatus: "public" },
              })),
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected URL: ${url}`);
      };
      return { fetchFn, calls };
    }

    it("fetches the transcript for the top keyword match among recent uploads, in one call", async () => {
      const { fetchFn, calls } = mockUploadsFetch(
        [{ videoId: "search-1", title: "Search Result 1" }],
        (url) => {
          if (url.includes("/captions?")) {
            return new Response(
              JSON.stringify({
                items: [{ id: "track-en", snippet: { language: "en", trackKind: "standard" } }],
              }),
              { status: 200 }
            );
          }
          if (url.includes("/captions/track-en")) {
            return new Response(mockSrtTranscript, { status: 200 });
          }
          return undefined;
        }
      );

      const deps = createMockDeps({ fetchFn: fetchFn as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { query: "Search Result 1" },
        {} as never
      )) as YouTubeTranscriptResult;

      assert.equal(result.error, false);
      assert.equal(result.videoId, "search-1");
      assert.equal(result.title, "Search Result 1");
      assert.equal(result.transcript, "Hello and welcome to this video.");

      assert.ok(calls.some((url) => url.includes("/playlistItems")));
      // The tool never calls fetch_youtube separately — resolution + transcript happen in this one execution.
      assert.ok(!calls.some((url) => url.includes("/youtube/v3/videos")));
    });

    it("matches by keyword overlap, not exact title text", async () => {
      const { fetchFn } = mockUploadsFetch(
        [
          { videoId: "vid-1", title: "Jerry Command line tool: generate work reports from the terminal" },
          { videoId: "vid-2", title: "July 21 Work update" },
          { videoId: "vid-3", title: "jerry test upload 1" },
        ],
        (url) => {
          if (url.includes("/captions?")) {
            return new Response(
              JSON.stringify({ items: [{ id: "track-en", snippet: { language: "en" } }] }),
              { status: 200 }
            );
          }
          if (url.includes("/captions/track-en")) {
            return new Response(mockSrtTranscript, { status: 200 });
          }
          return undefined;
        }
      );

      const deps = createMockDeps({ fetchFn: fetchFn as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { query: "get me a transcript of Jerry command line tool video from youtube" },
        {} as never
      )) as YouTubeTranscriptResult;

      assert.equal(result.error, false);
      assert.equal(result.videoId, "vid-1");
      assert.equal(result.title, "Jerry Command line tool: generate work reports from the terminal");
    });

    it("does not include a title when resolved by videoId directly", async () => {
      const mockFetch = async (url: string) => {
        if (url.includes("/captions?")) {
          return new Response(
            JSON.stringify({ items: [{ id: "track-en", snippet: { language: "en" } }] }),
            { status: 200 }
          );
        }
        return new Response(mockSrtTranscript, { status: 200 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { videoId: "video-123" },
        {} as never
      )) as YouTubeTranscriptResult;

      assert.equal(result.error, false);
      assert.equal(result.title, undefined);
    });

    it("returns an error when neither videoId nor query is provided", async () => {
      const deps = createMockDeps();
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute({}, {} as never)) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("Provide either videoId or query"));
    });

    it("returns a friendly error when no recent upload shares a keyword with the query", async () => {
      const { fetchFn } = mockUploadsFetch([{ videoId: "vid-1", title: "July 21 Work update" }]);

      const deps = createMockDeps({ fetchFn: fetchFn as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { query: "nonexistent video" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes('matching "nonexistent video"'));
    });

    it("propagates upload-listing API errors without attempting to fetch captions", async () => {
      const calls: string[] = [];
      const mockFetch = async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { query: "some title" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("403"));
      assert.equal(calls.length, 1);
    });
  });

  describe("error handling", () => {
    it("returns an error when no caption tracks exist", async () => {
      const mockFetch = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { videoId: "video-123" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("No caption tracks found"));
    });

    it("handles captions.list API errors", async () => {
      const mockFetch = async () =>
        new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 });

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { videoId: "video-123" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("403"));
    });

    it("handles captions.download API errors", async () => {
      const mockFetch = async (url: string) => {
        if (url.includes("/captions?")) {
          return new Response(
            JSON.stringify({ items: [{ id: "track-1", snippet: { language: "en" } }] }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ error: { message: "Not authorized" } }), {
          status: 401,
        });
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { videoId: "video-123" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("401"));
    });

    it("catches and wraps fetch errors", async () => {
      const mockFetch = async () => {
        throw new Error("Network error");
      };

      const deps = createMockDeps({ fetchFn: mockFetch as typeof fetch });
      const tool = createFetchYoutubeTranscriptTool(deps);

      const result = (await tool.execute(
        { videoId: "video-123" },
        {} as never
      )) as YouTubeResult;

      assert.ok("error" in result && result.error === true);
      assert.ok(result.message.includes("Network error"));
    });
  });
});

describe("isYouTubeNeedsAuth", () => {
  it("returns true for needsAuth results", () => {
    const result: YouTubeResult = {
      needsAuth: true,
      message: "Not connected",
    };
    assert.ok(isYouTubeNeedsAuth(result));
  });

  it("returns false for upload success results", () => {
    const result: YouTubeResult = {
      error: false,
      videoId: "vid-1",
      title: "Test",
      privacyStatus: "private",
      url: "https://youtube.com/watch?v=vid-1",
    };
    assert.ok(!isYouTubeNeedsAuth(result));
  });

  it("returns false for fetch success results", () => {
    const result: YouTubeResult = {
      error: false,
      videos: [],
    };
    assert.ok(!isYouTubeNeedsAuth(result));
  });

  it("returns false for error results", () => {
    const result: YouTubeResult = {
      error: true,
      message: "API error",
    };
    assert.ok(!isYouTubeNeedsAuth(result));
  });
});
