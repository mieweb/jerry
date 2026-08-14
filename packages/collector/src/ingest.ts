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
  /**
   * Embed the content into the VECTORS store via POST /v1/index (default: true).
   *
   * Footnote-backed collectors keep the bucket upload (so read_file still
   * resolves) but skip this, because footnote owns the searchable index.
   */
  index?: boolean;
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
  const shouldIndexContent = config.index ?? true;

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

    if (!shouldIndexContent) {
      return { success: true, uploaded, indexed: false };
    }

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

/**
 * Extensions footnote's docidx parser understands.
 *
 * Mirrors INDEXABLE_EXTENSIONS in vendor/footnote/src/utils/files.ts — anything
 * outside this set is skipped by the indexer, so there is no point rebuilding.
 */
export const FOOTNOTE_EXTENSIONS = [".md", ".txt", ".pdf", ".docx", ".xml"];

/**
 * Check whether a change to this file could affect the footnote index.
 */
export function isFootnoteIndexable(extension: string): boolean {
  return FOOTNOTE_EXTENSIONS.includes(extension.toLowerCase());
}
