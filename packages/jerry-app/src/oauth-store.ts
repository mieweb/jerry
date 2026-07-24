/**
 * Database-backed token store for OAuth tokens.
 *
 * Stores encrypted token blobs in the oauth_tokens table.
 * Encryption is handled by the oauth.ts module.
 */

import type { ToolContext } from "@mieweb/jerry-tools/runtime";
import type {
  TokenStore,
  TokenSet,
  EncryptedTokenBlob,
  encryptTokenSet,
  decryptTokenSet,
} from "@mieweb/jerry-tools/integrations/oauth";

type CloudDatabase = ToolContext["db"];

/**
 * Create a database-backed token store.
 *
 * @param db - Cloud database binding
 * @param encrypt - Encryption function
 * @param decrypt - Decryption function
 * @returns TokenStore implementation
 */
export function createDbTokenStore(
  db: CloudDatabase,
  encrypt: typeof encryptTokenSet,
  decrypt: typeof decryptTokenSet
): TokenStore {
  return {
    async load(userId: string, provider: string): Promise<TokenSet | null> {
      const result = await db
        .prepare(
          `SELECT encrypted_data FROM oauth_tokens
           WHERE user_id = ? AND provider = ?`
        )
        .bind(userId, provider)
        .first<{ encrypted_data: string }>();

      if (!result) return null;

      const blob = JSON.parse(result.encrypted_data) as EncryptedTokenBlob;
      return decrypt(blob);
    },

    async save(
      userId: string,
      provider: string,
      tokens: TokenSet
    ): Promise<void> {
      const blob = await encrypt(tokens);
      const encryptedData = JSON.stringify(blob);
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO oauth_tokens (id, user_id, provider, encrypted_data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, provider) DO UPDATE SET
             encrypted_data = excluded.encrypted_data,
             updated_at = excluded.updated_at`
        )
        .bind(crypto.randomUUID(), userId, provider, encryptedData, now, now)
        .run();
    },

    async delete(userId: string, provider: string): Promise<void> {
      await db
        .prepare(`DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?`)
        .bind(userId, provider)
        .run();
    },
  };
}
