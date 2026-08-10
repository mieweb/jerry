/**
 * Integration tools exports.
 */

export {
  type OAuthProviderConfig,
  type TokenSet,
  type EncryptedTokenBlob,
  type TokenStore,
  type OAuthClient,
  encryptTokenSet,
  decryptTokenSet,
  createMemoryTokenStore,
  createOAuthClient,
} from "./oauth.js";

export {
  type DriveDeps,
  type DriveFile,
  type DriveResult,
  type NeedsAuthResult,
  type DriveListResult,
  type DriveGetResult,
  type DriveErrorResult,
  createReadDriveTool,
  isNeedsAuth,
  GOOGLE_DRIVE_CONFIG,
} from "./drive.js";

export {
  type YoutubeDeps,
  type VideoFileData,
  type YouTubeVideo,
  type YouTubeNeedsAuthResult,
  type YouTubeUploadResult,
  type YouTubeFetchResult,
  type YouTubeTranscriptSegment,
  type YouTubeTranscriptResult,
  type YouTubeErrorResult,
  type YouTubeResult,
  createPostYoutubeTool,
  createFetchYoutubeTool,
  createFetchYoutubeTranscriptTool,
  isYouTubeNeedsAuth,
  GOOGLE_YOUTUBE_CONFIG,
} from "./youtube.js";
