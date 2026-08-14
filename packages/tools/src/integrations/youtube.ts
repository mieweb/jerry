/**
 * YouTube integration tools.
 *
 * Provides upload and metadata access to YouTube via OAuth2.
 * Requires egress: "allow-tools" and ask-disposition approval flow.
 */

import { tool } from "ai";
import { z } from "zod";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit for multipart upload

/**
 * How many of the user's most recent uploads to consider when resolving a
 * transcript request by title/query. YouTube's `search.list` with
 * `forMine=true` does near-exact matching rather than fuzzy/keyword
 * relevance, so title resolution instead scans recent uploads locally.
 */
const RECENT_UPLOADS_LIMIT = 50;

/**
 * Video file data returned by readVideoFile dependency.
 */
export interface VideoFileData {
  bytes: Uint8Array;
  mimeType: string;
  size: number;
}

/**
 * Dependencies for YouTube tools.
 */
export interface YoutubeDeps {
  /** Get valid access token (refreshing if needed), throws if no tokens */
  getAccessToken: () => Promise<string>;
  /** Get authorization URL for user to connect Google account */
  getAuthorizationUrl?: (state?: string) => string;
  /** Optional fetch function for testing */
  fetchFn?: typeof fetch;
  /** Read video file from local filesystem (required for post_youtube) */
  readVideoFile?: (filePath: string) => Promise<VideoFileData>;
}

/**
 * YouTube video metadata from API response.
 */
export interface YouTubeVideo {
  id: string;
  title: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  privacyStatus?: string;
  url: string;
  thumbnailUrl?: string;
}

/**
 * Result when authentication is needed.
 */
export interface YouTubeNeedsAuthResult {
  needsAuth: true;
  authUrl?: string;
  message: string;
}

/**
 * Result for a successful upload.
 */
export interface YouTubeUploadResult {
  error: false;
  videoId: string;
  title: string;
  privacyStatus: string;
  url: string;
}

/**
 * Result for a successful fetch (single video or list).
 */
export interface YouTubeFetchResult {
  error: false;
  videos: YouTubeVideo[];
  nextPageToken?: string;
}

/**
 * A single timed transcript segment.
 */
export interface YouTubeTranscriptSegment {
  /** Start time in seconds */
  start: number;
  /** Duration in seconds */
  duration: number;
  text: string;
}

/**
 * Result for a successful transcript fetch.
 */
export interface YouTubeTranscriptResult {
  error: false;
  videoId: string;
  /** Video title, present when the video was resolved from a `query` rather than a `videoId` */
  title?: string;
  language?: string;
  /** "standard" (creator-uploaded) or "asr" (auto-generated) */
  trackKind?: string;
  /** Full transcript as plain text */
  transcript: string;
  segments: YouTubeTranscriptSegment[];
}

/**
 * Result for an API or config error.
 */
export interface YouTubeErrorResult {
  error: true;
  message: string;
}

export type YouTubeResult =
  | YouTubeNeedsAuthResult
  | YouTubeUploadResult
  | YouTubeFetchResult
  | YouTubeTranscriptResult
  | YouTubeErrorResult;

/**
 * Check if a result indicates auth is needed.
 */
export function isYouTubeNeedsAuth(result: YouTubeResult): result is YouTubeNeedsAuthResult {
  return "needsAuth" in result && result.needsAuth === true;
}

/**
 * Infer MIME type from file extension.
 */
function getMimeTypeFromPath(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    webm: "video/webm",
    mkv: "video/x-matroska",
    "3gp": "video/3gpp",
    m4v: "video/x-m4v",
  };
  return mimeTypes[ext ?? ""] ?? "video/mp4";
}

/**
 * Build multipart body for YouTube upload.
 */
function buildMultipartBody(
  metadata: Record<string, unknown>,
  videoBytes: Uint8Array,
  videoMimeType: string,
  boundary: string
): Uint8Array {
  const encoder = new TextEncoder();

  const metadataJson = JSON.stringify(metadata);
  const metadataPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataJson}\r\n`;

  const videoPart =
    `--${boundary}\r\n` +
    `Content-Type: ${videoMimeType}\r\n` +
    `Content-Transfer-Encoding: binary\r\n\r\n`;

  const closingBoundary = `\r\n--${boundary}--`;

  const metadataBytes = encoder.encode(metadataPart);
  const videoPartBytes = encoder.encode(videoPart);
  const closingBytes = encoder.encode(closingBoundary);

  const totalLength = metadataBytes.length + videoPartBytes.length + videoBytes.length + closingBytes.length;
  const body = new Uint8Array(totalLength);

  let offset = 0;
  body.set(metadataBytes, offset);
  offset += metadataBytes.length;
  body.set(videoPartBytes, offset);
  offset += videoPartBytes.length;
  body.set(videoBytes, offset);
  offset += videoBytes.length;
  body.set(closingBytes, offset);

  return body;
}

/**
 * Create the post_youtube tool for uploading videos.
 *
 * @param deps - Dependencies for OAuth, fetch, and file reading
 * @returns AI SDK tool for uploading to YouTube
 */
export function createPostYoutubeTool(deps: YoutubeDeps) {
  const fetchFn = deps.fetchFn ?? fetch;

  return tool({
    description:
      "Upload a video to YouTube. Requires a local video file path, title, and optional metadata. " +
      "Videos are uploaded as private by default. Use this to share recordings or content.",
    parameters: z.object({
      filePath: z.string().describe("Local file path to the video to upload"),
      title: z.string().min(1).max(100).describe("Video title (required, max 100 characters)"),
      description: z.string().max(5000).optional().describe("Video description (max 5000 characters)"),
      privacyStatus: z
        .enum(["private", "unlisted", "public"])
        .optional()
        .default("private")
        .describe("Privacy setting: private (default), unlisted, or public"),
      tags: z.array(z.string()).max(30).optional().describe("Video tags (max 30 tags)"),
    }),
    execute: async ({
      filePath,
      title,
      description,
      privacyStatus = "private",
      tags,
    }): Promise<YouTubeUploadResult | YouTubeNeedsAuthResult | YouTubeErrorResult> => {
      if (!deps.readVideoFile) {
        return {
          error: true,
          message: "Video upload is not available. File reading is not configured for this environment.",
        };
      }

      let accessToken: string;
      try {
        accessToken = await deps.getAccessToken();
      } catch {
        const authUrl = deps.getAuthorizationUrl?.();
        return {
          needsAuth: true,
          authUrl,
          message:
            "YouTube is not connected. " +
            (authUrl
              ? `Visit ${authUrl} to authorize access.`
              : "Please connect your Google account to use YouTube features."),
        };
      }

      let videoData: VideoFileData;
      try {
        videoData = await deps.readVideoFile(filePath);
      } catch (err) {
        return {
          error: true,
          message: `Failed to read video file: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      if (videoData.size > MAX_FILE_SIZE) {
        return {
          error: true,
          message: `Video file is too large (${Math.round(videoData.size / 1024 / 1024)}MB). Maximum size is 100MB. Use YouTube Studio for larger uploads.`,
        };
      }

      const metadata = {
        snippet: {
          title,
          description: description ?? "",
          tags: tags ?? [],
          categoryId: "22", // People & Blogs (common default)
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      };

      const boundary = `----JerryUpload${Date.now()}`;
      const mimeType = videoData.mimeType || getMimeTypeFromPath(filePath);
      const body = buildMultipartBody(metadata, videoData.bytes, mimeType, boundary);

      const uploadUrl = `${YOUTUBE_UPLOAD_URL}?uploadType=multipart&part=snippet,status`;

      try {
        const response = await fetchFn(uploadUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Content-Length": String(body.length),
          },
          body,
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            error: true,
            message: `YouTube upload failed (${response.status}): ${errorText.slice(0, 200)}`,
          };
        }

        const data = (await response.json()) as {
          id: string;
          snippet?: { title?: string };
          status?: { privacyStatus?: string };
        };

        return {
          error: false,
          videoId: data.id,
          title: data.snippet?.title ?? title,
          privacyStatus: data.status?.privacyStatus ?? privacyStatus,
          url: `https://www.youtube.com/watch?v=${data.id}`,
        };
      } catch (err) {
        return {
          error: true,
          message: `YouTube upload error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
}

/**
 * Create the fetch_youtube tool for retrieving video metadata.
 *
 * @param deps - Dependencies for OAuth and fetch
 * @returns AI SDK tool for fetching YouTube video info
 */
export function createFetchYoutubeTool(deps: YoutubeDeps) {
  const fetchFn = deps.fetchFn ?? fetch;

  return tool({
    description:
      "Fetch video METADATA (title, privacy, url, thumbnail, publish date) from the authenticated " +
      "user's YouTube channel. Modes: (1) omit videoId and q to list the user's uploads (includes " +
      "public, private, unlisted, regular videos, and Shorts); set listAll=true when the user asks " +
      "for all uploads; (2) pass videoId to get one video's metadata; " +
      "(3) pass q to search within the user's own uploads (forMine). " +
      "Do not pass null for omitted fields — leave them out. " +
      "Always report title/privacy/url exactly from the tool result; never invent titles. " +
      "Do NOT use this tool if the user asks for a transcript, captions, or what was said in a " +
      "video — use fetch_youtube_transcript instead, even if you only have a title (it accepts a " +
      "query and resolves the video itself; it does not need this tool to run first).",
    parameters: z.object({
      videoId: z.preprocess(
        (v) =>
          v === null || v === "" || v === "null" || v === "undefined"
            ? undefined
            : v,
        z.string().optional()
      ).describe("Specific video ID to fetch. If provided, returns that video's metadata."),
      q: z.preprocess(
        (v) =>
          v === null || v === "" || v === "null" || v === "undefined"
            ? undefined
            : v,
        z.string().optional()
      ).describe(
        "Search query within the authenticated user's uploads (private/unlisted included). " +
          "Ignored if videoId is provided. Omit (do not pass null) to list recent uploads."
      ),
      maxResults: z.preprocess(
        (v) =>
          v === null || v === "" || v === "null" || v === "undefined"
            ? undefined
            : v,
        z.coerce.number().int().min(1).max(50).optional()
      ).describe("Maximum number of results to return (1-50, default 10)"),
      listAll: z.preprocess(
        (v) => {
          if (v === true || v === "true") return true;
          if (
            v === false ||
            v === "false" ||
            v === null ||
            v === "" ||
            v === "null" ||
            v === "undefined"
          ) {
            return false;
          }
          return v;
        },
        z.boolean().optional()
      ).describe(
        "Set true to paginate through every upload. Applies when videoId and q are omitted."
      ),
    }),
    execute: async ({
      videoId,
      q,
      maxResults = 10,
      listAll = false,
    }): Promise<YouTubeFetchResult | YouTubeNeedsAuthResult | YouTubeErrorResult> => {
      let accessToken: string;
      try {
        accessToken = await deps.getAccessToken();
      } catch {
        const authUrl = deps.getAuthorizationUrl?.();
        return {
          needsAuth: true,
          authUrl,
          message:
            "YouTube is not connected. " +
            (authUrl
              ? `Visit ${authUrl} to authorize access.`
              : "Please connect your Google account to use YouTube features."),
        };
      }

      const headers = {
        Authorization: `Bearer ${accessToken}`,
      };

      // Normalize after preprocess (models sometimes still pass null)
      const id = videoId || undefined;
      const query = q || undefined;

      try {
        if (id) {
          return await getVideo(fetchFn, headers, id);
        } else if (query) {
          return await searchVideos(fetchFn, headers, query, maxResults);
        } else {
          return await listMyVideos(fetchFn, headers, maxResults, listAll);
        }
      } catch (err) {
        return {
          error: true,
          message: `YouTube API error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
}

/**
 * Generic filler words stripped before matching a query against video titles.
 * These describe the *request* ("get me a transcript of this video") rather
 * than the video's actual content, and would otherwise dilute keyword scoring.
 */
const TITLE_MATCH_STOP_WORDS = new Set([
  "a", "an", "the", "of", "my", "for", "on", "in", "to", "and", "or",
  "get", "me", "please", "show", "find", "give",
  "video", "videos", "youtube", "short", "shorts", "clip",
  "transcript", "transcription", "caption", "captions",
]);

/**
 * Split text into lowercase alphanumeric tokens for keyword matching.
 */
function tokenizeForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 0);
}

/**
 * Find the best keyword match for `query` among `videos` by title.
 *
 * YouTube's `search.list` with `forMine=true` matches titles fairly
 * literally rather than doing fuzzy relevance ranking, so natural-language
 * requests like "get me a transcript of the Jerry command line tool video"
 * often return zero results even when a clearly-matching video exists.
 * Instead, this scores each candidate by how many of the query's
 * (non-filler) keywords appear in its title, and returns the highest-scoring
 * video — or undefined if none share a single keyword.
 */
function findBestTitleMatch(query: string, videos: YouTubeVideo[]): YouTubeVideo | undefined {
  const queryTokens = tokenizeForMatch(query).filter((token) => !TITLE_MATCH_STOP_WORDS.has(token));
  if (queryTokens.length === 0) return undefined;

  let best: YouTubeVideo | undefined;
  let bestScore = 0;

  for (const video of videos) {
    const title = video.title.toLowerCase();
    const score = queryTokens.reduce((count, token) => count + (title.includes(token) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = video;
    }
  }

  return bestScore > 0 ? best : undefined;
}

/**
 * Create the fetch_youtube_transcript tool for retrieving a video's captions.
 *
 * Uses the official YouTube Data API captions.list / captions.download
 * endpoints, which only work for videos owned by the authenticated account
 * (requires the youtube.force-ssl scope). Third-party videos are not
 * accessible through this API.
 *
 * @param deps - Dependencies for OAuth and fetch
 * @returns AI SDK tool for fetching a YouTube video transcript
 */
export function createFetchYoutubeTranscriptTool(deps: YoutubeDeps) {
  const fetchFn = deps.fetchFn ?? fetch;

  return tool({
    description:
      "USE THIS TOOL for any request about a video's transcript, captions, or what was said/discussed " +
      "in a video — this is the only tool that returns spoken content, not just metadata. " +
      "The video must belong to the authenticated user's connected Google account — this uses the " +
      "official YouTube Captions API, which cannot access other creators' videos. " +
      "If you don't have the videoId, pass query with keywords from the video's title (a natural " +
      "phrase is fine, e.g. \"the Jerry command line tool video\" — filler words are ignored and it " +
      "matches by keyword overlap against the user's recent uploads, not exact title text). " +
      "Do NOT call fetch_youtube first to look it up; that tool only returns metadata (title/url/etc), " +
      "never a transcript, so calling it wastes a step. This tool resolves the video from query " +
      "itself, in the same call/approval, and returns the resolved title so you can confirm the match. " +
      "Prefers a caption track matching the requested language, falls back to auto-generated " +
      "captions, then any available track. Returns plain transcript text and timed segments.",
    parameters: z.object({
      videoId: z.preprocess(
        (v) =>
          v === null || v === "" || v === "null" || v === "undefined"
            ? undefined
            : v,
        z.string().optional()
      ).describe("YouTube video ID to fetch the transcript for, if already known."),
      query: z.preprocess(
        (v) =>
          v === null || v === "" || v === "null" || v === "undefined"
            ? undefined
            : v,
        z.string().optional()
      ).describe(
        "Keywords from the video's title to look up on the user's channel when videoId is not " +
          "known — matched by keyword overlap against recent uploads, not exact title text, so a " +
          "natural phrase works. Ignored if videoId is provided."
      ),
      language: z.preprocess(
        (v) =>
          v === null || v === "" || v === "null" || v === "undefined"
            ? undefined
            : v,
        z.string().optional()
      ).describe(
        "Preferred caption language (ISO 639-1, e.g. 'en'). Omit to accept any available track " +
          "(prefers auto-generated captions if no exact match is requested)."
      ),
    }),
    execute: async ({
      videoId,
      query,
      language,
    }): Promise<YouTubeTranscriptResult | YouTubeNeedsAuthResult | YouTubeErrorResult> => {
      if (!videoId && !query) {
        return {
          error: true,
          message: "Provide either videoId or query (e.g. the video's title) to identify the video.",
        };
      }

      let accessToken: string;
      try {
        accessToken = await deps.getAccessToken();
      } catch {
        const authUrl = deps.getAuthorizationUrl?.();
        return {
          needsAuth: true,
          authUrl,
          message:
            "YouTube is not connected. " +
            (authUrl
              ? `Visit ${authUrl} to authorize access.`
              : "Please connect your Google account to use YouTube features."),
        };
      }

      const headers = {
        Authorization: `Bearer ${accessToken}`,
      };

      try {
        let resolvedVideoId = videoId;
        let resolvedTitle: string | undefined;

        if (!resolvedVideoId) {
          const uploadsResult = await listMyVideos(fetchFn, headers, RECENT_UPLOADS_LIMIT, false);
          if (uploadsResult.error) {
            return uploadsResult;
          }
          const match = findBestTitleMatch(query!, uploadsResult.videos);
          if (!match) {
            return {
              error: true,
              message:
                `No video found among your ${RECENT_UPLOADS_LIMIT} most recent uploads matching ` +
                `"${query}". Try different or fewer keywords, or provide the videoId directly.`,
            };
          }
          resolvedVideoId = match.id;
          resolvedTitle = match.title;
        }

        const result = await fetchTranscript(fetchFn, headers, resolvedVideoId, language || undefined);
        if (!result.error && resolvedTitle) {
          return { ...result, title: resolvedTitle };
        }
        return result;
      } catch (err) {
        return {
          error: true,
          message: `YouTube transcript error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
}

/**
 * Get a specific video by ID.
 */
async function getVideo(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  videoId: string
): Promise<YouTubeFetchResult | YouTubeErrorResult> {
  const params = new URLSearchParams({
    part: "snippet,status",
    id: videoId,
  });

  const url = `${YOUTUBE_API_BASE}/videos?${params.toString()}`;
  const response = await fetchFn(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      error: true,
      message: `YouTube get failed (${response.status}): ${errorText.slice(0, 200)}`,
    };
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        description?: string;
        channelId?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: { default?: { url?: string } };
      };
      status?: { privacyStatus?: string };
    }>;
  };

  const videos: YouTubeVideo[] = (data.items ?? []).map((item) => ({
    id: item.id,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description,
    channelId: item.snippet?.channelId,
    channelTitle: item.snippet?.channelTitle,
    publishedAt: item.snippet?.publishedAt,
    privacyStatus: item.status?.privacyStatus,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    thumbnailUrl: item.snippet?.thumbnails?.default?.url,
  }));

  return { error: false, videos };
}

/**
 * Search for videos.
 */
async function searchVideos(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  q: string,
  maxResults: number
): Promise<YouTubeFetchResult | YouTubeErrorResult> {
  // forMine=true searches the authenticated user's videos (private/unlisted included).
  // Public site-wide search would miss the user's private/unlisted library.
  const params = new URLSearchParams({
    part: "snippet",
    q,
    type: "video",
    forMine: "true",
    maxResults: String(maxResults),
  });

  const url = `${YOUTUBE_API_BASE}/search?${params.toString()}`;
  const response = await fetchFn(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      error: true,
      message: `YouTube search failed (${response.status}): ${errorText.slice(0, 200)}`,
    };
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: { videoId: string };
      snippet?: {
        title?: string;
        description?: string;
        channelId?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: { default?: { url?: string } };
      };
    }>;
    nextPageToken?: string;
  };

  const videos: YouTubeVideo[] = (data.items ?? []).map((item) => ({
    id: item.id.videoId,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description,
    channelId: item.snippet?.channelId,
    channelTitle: item.snippet?.channelTitle,
    publishedAt: item.snippet?.publishedAt,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    thumbnailUrl: item.snippet?.thumbnails?.default?.url,
  }));

  return { error: false, videos, nextPageToken: data.nextPageToken };
}

/**
 * List the authenticated user's uploaded videos.
 */
async function listMyVideos(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  maxResults: number,
  listAll: boolean
): Promise<YouTubeFetchResult | YouTubeErrorResult> {
  const channelParams = new URLSearchParams({
    part: "contentDetails",
    mine: "true",
  });

  const channelUrl = `${YOUTUBE_API_BASE}/channels?${channelParams.toString()}`;
  const channelResponse = await fetchFn(channelUrl, { headers });

  if (!channelResponse.ok) {
    const errorText = await channelResponse.text();
    return {
      error: true,
      message: `YouTube channel fetch failed (${channelResponse.status}): ${errorText.slice(0, 200)}`,
    };
  }

  const channelData = (await channelResponse.json()) as {
    items?: Array<{
      contentDetails?: {
        relatedPlaylists?: { uploads?: string };
      };
    }>;
  };

  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    return { error: false, videos: [] };
  }

  const videos: YouTubeVideo[] = [];
  let pageToken: string | undefined;

  do {
    const remaining = Math.max(1, maxResults - videos.length);
    const playlistParams = new URLSearchParams({
      part: "snippet,status",
      playlistId: uploadsPlaylistId,
      maxResults: String(listAll ? 50 : Math.min(50, remaining)),
    });
    if (pageToken) playlistParams.set("pageToken", pageToken);

    const playlistUrl = `${YOUTUBE_API_BASE}/playlistItems?${playlistParams.toString()}`;
    const playlistResponse = await fetchFn(playlistUrl, { headers });

    if (!playlistResponse.ok) {
      const errorText = await playlistResponse.text();
      return {
        error: true,
        message: `YouTube playlist fetch failed (${playlistResponse.status}): ${errorText.slice(0, 200)}`,
      };
    }

    const playlistData = (await playlistResponse.json()) as {
      items?: Array<{
        snippet?: {
          resourceId?: { videoId?: string };
          title?: string;
          description?: string;
          channelId?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: { default?: { url?: string } };
        };
        status?: { privacyStatus?: string };
      }>;
      nextPageToken?: string;
    };

    videos.push(
      ...(playlistData.items ?? [])
        .filter((item) => item.snippet?.resourceId?.videoId)
        .map((item) => ({
          id: item.snippet!.resourceId!.videoId!,
          title: item.snippet?.title ?? "",
          description: item.snippet?.description,
          channelId: item.snippet?.channelId,
          channelTitle: item.snippet?.channelTitle,
          publishedAt: item.snippet?.publishedAt,
          privacyStatus: item.status?.privacyStatus,
          url: `https://www.youtube.com/watch?v=${item.snippet!.resourceId!.videoId!}`,
          thumbnailUrl: item.snippet?.thumbnails?.default?.url,
        }))
    );

    pageToken = playlistData.nextPageToken;
  } while (pageToken && (listAll || videos.length < maxResults));

  return {
    error: false,
    videos,
    nextPageToken: listAll ? undefined : pageToken,
  };
}

/**
 * List caption tracks and download the best-matching one as a transcript.
 */
async function fetchTranscript(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  videoId: string,
  language: string | undefined
): Promise<YouTubeTranscriptResult | YouTubeErrorResult> {
  const listParams = new URLSearchParams({
    part: "snippet",
    videoId,
  });

  const listUrl = `${YOUTUBE_API_BASE}/captions?${listParams.toString()}`;
  const listResponse = await fetchFn(listUrl, { headers });

  if (!listResponse.ok) {
    const errorText = await listResponse.text();
    return {
      error: true,
      message: `YouTube captions list failed (${listResponse.status}): ${errorText.slice(0, 200)}`,
    };
  }

  const listData = (await listResponse.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        language?: string;
        trackKind?: string;
        name?: string;
      };
    }>;
  };

  const tracks = listData.items ?? [];
  if (tracks.length === 0) {
    return {
      error: true,
      message: `No caption tracks found for video "${videoId}". The video may not have captions, or captions may still be processing.`,
    };
  }

  const track =
    (language && tracks.find((t) => t.snippet?.language === language)) ||
    tracks.find((t) => t.snippet?.trackKind === "asr") ||
    tracks[0]!;

  const downloadParams = new URLSearchParams({ tfmt: "srt" });
  const downloadUrl = `${YOUTUBE_API_BASE}/captions/${track.id}?${downloadParams.toString()}`;
  const downloadResponse = await fetchFn(downloadUrl, { headers });

  if (!downloadResponse.ok) {
    const errorText = await downloadResponse.text();
    return {
      error: true,
      message: `YouTube caption download failed (${downloadResponse.status}): ${errorText.slice(0, 200)}`,
    };
  }

  const srt = await downloadResponse.text();
  const segments = parseSrt(srt);
  const transcript = segments
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    error: false,
    videoId,
    language: track.snippet?.language,
    trackKind: track.snippet?.trackKind,
    transcript,
    segments,
  };
}

/**
 * Convert an SRT timestamp ("HH:MM:SS,mmm") to seconds.
 */
function srtTimeToSeconds(time: string): number {
  const match = time.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!match) return 0;
  const [, hours, minutes, seconds, millis] = match;
  return (
    parseInt(hours!, 10) * 3600 +
    parseInt(minutes!, 10) * 60 +
    parseInt(seconds!, 10) +
    parseInt(millis!, 10) / 1000
  );
}

/**
 * Parse SRT-formatted captions into timed transcript segments.
 */
function parseSrt(srt: string): YouTubeTranscriptSegment[] {
  const blocks = srt.replace(/\r\n/g, "\n").trim().split(/\n\n+/);
  const segments: YouTubeTranscriptSegment[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) continue;

    const [startRaw, endRaw] = lines[timingIndex]!.split("-->").map((s) => s.trim());
    if (!startRaw || !endRaw) continue;

    const start = srtTimeToSeconds(startRaw);
    const end = srtTimeToSeconds(endRaw);
    const text = lines.slice(timingIndex + 1).join(" ").trim();

    if (text) {
      segments.push({ start, duration: Math.max(0, end - start), text });
    }
  }

  return segments;
}

/**
 * Google OAuth2 configuration for YouTube.
 */
export const GOOGLE_YOUTUBE_CONFIG = {
  provider: "google",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
  ],
} as const;
