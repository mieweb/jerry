/**
 * Google Drive integration tool.
 *
 * Provides read access to Google Drive files via OAuth2.
 * Requires egress: "allow-tools" and ask-disposition approval flow.
 */

import { tool } from "ai";
import { z } from "zod";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

/**
 * Dependencies for the Drive tool.
 */
export interface DriveDeps {
  /** Get valid access token (refreshing if needed), throws if no tokens */
  getAccessToken: () => Promise<string>;
  /** Get authorization URL for user to connect Google account */
  getAuthorizationUrl?: (state?: string) => string;
  /** Optional fetch function for testing */
  fetchFn?: typeof fetch;
}

/**
 * Drive file metadata from API response.
 */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  shared?: boolean;
  webViewLink?: string;
  owners?: Array<{ displayName?: string; emailAddress?: string }>;
  size?: string;
}

/**
 * Result when authentication is needed.
 */
export interface NeedsAuthResult {
  needsAuth: true;
  authUrl?: string;
  message: string;
}

/**
 * Result for a successful file list.
 */
export interface DriveListResult {
  error: false;
  files: DriveFile[];
  nextPageToken?: string;
}

/**
 * Result for a successful file get.
 */
export interface DriveGetResult {
  error: false;
  file: DriveFile;
  content?: string;
}

/**
 * Result for an API error.
 */
export interface DriveErrorResult {
  error: true;
  message: string;
}

export type DriveResult =
  | NeedsAuthResult
  | DriveListResult
  | DriveGetResult
  | DriveErrorResult;

/**
 * Check if a result indicates auth is needed.
 */
export function isNeedsAuth(result: DriveResult): result is NeedsAuthResult {
  return "needsAuth" in result && result.needsAuth === true;
}

/**
 * Fields to request for file metadata.
 */
const FILE_FIELDS = "id,name,mimeType,modifiedTime,shared,webViewLink,owners,size";

/**
 * Create the read_drive tool.
 *
 * @param deps - Dependencies for OAuth and fetch
 * @returns AI SDK tool for reading Google Drive
 */
export function createReadDriveTool(deps: DriveDeps) {
  const fetchFn = deps.fetchFn ?? fetch;

  return tool({
    description:
      "Read files from Google Drive. List files with optional query, or get a specific file by ID. " +
      "Use this to answer questions about documents, shared files, or recent activity in Drive.",
    parameters: z.object({
      q: z
        .string()
        .optional()
        .describe(
          "Drive search query using Drive query syntax. Examples: \"sharedWithMe\", \"'me' in owners\", " +
          "\"name contains 'report'\", \"modifiedTime > '2024-01-01T00:00:00'\". " +
          "Use ISO timestamps for dates — not words like 'today'. Default lists recent non-trashed files."
        ),
      fileId: z
        .string()
        .optional()
        .describe("Specific file ID to fetch. If provided, ignores q and returns that file's metadata."),
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("Maximum number of files to return (1-100, default 20)"),
      includeContent: z.coerce
        .boolean()
        .optional()
        .default(false)
        .describe(
          "When fetching a specific file, also retrieve its content. " +
          "Only works for text-based files (documents, text, code). Large files are truncated."
        ),
    }),
    execute: async ({ q, fileId, maxResults = 20, includeContent = false }): Promise<DriveResult> => {
      let accessToken: string;

      try {
        accessToken = await deps.getAccessToken();
      } catch {
        const authUrl = deps.getAuthorizationUrl?.();
        return {
          needsAuth: true,
          authUrl,
          message:
            "Google Drive is not connected. " +
            (authUrl
              ? `Visit ${authUrl} to authorize access.`
              : "Please connect your Google account to use Drive features."),
        };
      }

      const headers = {
        Authorization: `Bearer ${accessToken}`,
      };

      try {
        if (fileId) {
          return await getFile(fetchFn, headers, fileId, includeContent);
        } else {
          return await listFiles(fetchFn, headers, q, maxResults);
        }
      } catch (err) {
        return {
          error: true,
          message: `Drive API error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
}

/**
 * List files from Drive.
 */
async function listFiles(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  q: string | undefined,
  maxResults: number
): Promise<DriveListResult | DriveErrorResult> {
  const params = new URLSearchParams({
    pageSize: String(maxResults),
    fields: `files(${FILE_FIELDS}),nextPageToken`,
    orderBy: "modifiedTime desc",
  });

  const query = q ?? "trashed = false";
  params.set("q", query);

  const url = `${DRIVE_API_BASE}/files?${params.toString()}`;
  const response = await fetchFn(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      error: true,
      message: `Drive list failed (${response.status}): ${errorText.slice(0, 200)}`,
    };
  }

  const data = (await response.json()) as {
    files?: DriveFile[];
    nextPageToken?: string;
  };

  return {
    error: false,
    files: data.files ?? [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Get a specific file from Drive.
 */
async function getFile(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  fileId: string,
  includeContent: boolean
): Promise<DriveGetResult | DriveErrorResult> {
  const metadataUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`;
  const metaResponse = await fetchFn(metadataUrl, { headers });

  if (!metaResponse.ok) {
    const errorText = await metaResponse.text();
    return {
      error: true,
      message: `Drive get failed (${metaResponse.status}): ${errorText.slice(0, 200)}`,
    };
  }

  const file = (await metaResponse.json()) as DriveFile;
  let content: string | undefined;

  if (includeContent) {
    content = await fetchFileContent(fetchFn, headers, fileId, file.mimeType);
  }

  return {
    error: false,
    file,
    content,
  };
}

/**
 * Fetch file content based on MIME type.
 * Google Docs/Sheets/Slides are exported; other files use media download.
 */
async function fetchFileContent(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  fileId: string,
  mimeType: string
): Promise<string | undefined> {
  const maxContentLength = 50000;

  const googleDocsMimeTypes: Record<string, string> = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
  };

  let contentUrl: string;

  if (googleDocsMimeTypes[mimeType]) {
    const exportMime = googleDocsMimeTypes[mimeType];
    contentUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`;
  } else if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/javascript" ||
    mimeType === "application/xml"
  ) {
    contentUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
  } else {
    return undefined;
  }

  try {
    const response = await fetchFn(contentUrl, { headers });

    if (!response.ok) {
      return undefined;
    }

    const text = await response.text();
    if (text.length > maxContentLength) {
      return text.slice(0, maxContentLength) + "\n... [content truncated]";
    }
    return text;
  } catch {
    return undefined;
  }
}

/**
 * Google OAuth2 configuration for Drive.
 */
export const GOOGLE_DRIVE_CONFIG = {
  provider: "google",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
} as const;
