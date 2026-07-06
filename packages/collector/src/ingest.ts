/**
 * Ingest pipeline — uploads files to bucket and triggers indexing.
 *
 * This module handles the collector → Jerry indexing flow:
 * 1. Upload file content to Jerry's bucket storage (PUT /v1/files/:path)
 * 2. Trigger document indexing (POST /v1/index)
 */

export interface IngestConfig {
  /** Jerry API base URL (default: http://127.0.0.1:8787) */
  jerryUrl?: string;
}

export interface IngestResult {
  success: boolean;
  uploaded?: boolean;
  indexed?: boolean;
  error?: string;
}

/**
 * Ingest a file into Jerry's storage and index it for semantic search.
 *
 * @param filePath - The original file path (used as the storage key)
 * @param content - The file content (text for indexing)
 * @param config - Optional configuration
 * @returns Result indicating success/failure of upload and indexing
 */
export async function ingestFile(
  filePath: string,
  content: string,
  config: IngestConfig = {}
): Promise<IngestResult> {
  const jerryUrl = config.jerryUrl ?? "http://127.0.0.1:8787";

  try {
    // Step 1: Upload file content to bucket storage
    const uploadResponse = await fetch(
      `${jerryUrl}/v1/files/${encodeURIComponent(filePath)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: content,
      }
    );

    if (!uploadResponse.ok) {
      // Don't fail the whole ingest if upload fails — indexing can still work
      console.warn(
        `File upload failed for ${filePath}: ${uploadResponse.status} ${uploadResponse.statusText}`
      );
    }

    const uploaded = uploadResponse.ok;

    // Step 2: Trigger indexing
    const indexResponse = await fetch(`${jerryUrl}/v1/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        content,
        metadata: {
          source: "collector",
          indexedAt: new Date().toISOString(),
        },
      }),
    });

    if (!indexResponse.ok) {
      const errorText = await indexResponse.text().catch(() => "");
      return {
        success: false,
        uploaded,
        indexed: false,
        error: `Indexing failed: ${indexResponse.status} ${errorText}`,
      };
    }

    return {
      success: true,
      uploaded,
      indexed: true,
    };
  } catch (err) {
    return {
      success: false,
      uploaded: false,
      indexed: false,
      error: `Ingest error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Check if content should be indexed (text-based, reasonable size).
 */
export function shouldIndex(
  extension: string,
  size: number,
  maxSize = 100 * 1024 // 100KB default
): boolean {
  const textExtensions = [".txt", ".md", ".json", ".csv", ".xml", ".html", ".yaml", ".yml"];
  return textExtensions.includes(extension.toLowerCase()) && size <= maxSize;
}
