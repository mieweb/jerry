/**
 * Google OAuth configuration and client factory.
 *
 * Builds OAuthClient for Google Drive/YouTube from environment variables.
 * Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI
 */

import type { ToolContext } from "@mieweb/jerry-tools/runtime";
import {
  type OAuthProviderConfig,
  type OAuthClient,
  createOAuthClient,
  encryptTokenSet,
  decryptTokenSet,
} from "@mieweb/jerry-tools/integrations/oauth";
import { GOOGLE_DRIVE_CONFIG } from "@mieweb/jerry-tools/integrations/drive";
import { GOOGLE_YOUTUBE_CONFIG } from "@mieweb/jerry-tools/integrations/youtube";
import { createDbTokenStore } from "./oauth-store.js";

/**
 * Environment variables for Google OAuth.
 */
export interface GoogleOAuthEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT_URI?: string;
}

/**
 * Check if Google OAuth is configured via environment variables.
 */
export function isGoogleOAuthConfigured(env: GoogleOAuthEnv): boolean {
  return !!(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

/**
 * Build Google OAuth provider configuration from environment.
 * Returns undefined if required vars are missing.
 */
export function buildGoogleOAuthConfig(
  env: GoogleOAuthEnv
): OAuthProviderConfig | undefined {
  if (!isGoogleOAuthConfigured(env)) {
    return undefined;
  }

  return {
    provider: GOOGLE_DRIVE_CONFIG.provider,
    clientId: env.GOOGLE_CLIENT_ID!,
    clientSecret: env.GOOGLE_CLIENT_SECRET!,
    authUrl: GOOGLE_DRIVE_CONFIG.authUrl,
    tokenUrl: GOOGLE_DRIVE_CONFIG.tokenUrl,
    scopes: [...GOOGLE_DRIVE_CONFIG.scopes, ...GOOGLE_YOUTUBE_CONFIG.scopes],
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI!,
  };
}

/**
 * Create a Google OAuth client for token management.
 * Returns undefined if Google OAuth is not configured.
 *
 * @param env - Environment variables
 * @param db - Database binding for token storage
 */
export function createGoogleOAuthClient(
  env: GoogleOAuthEnv,
  db: ToolContext["db"]
): OAuthClient | undefined {
  const config = buildGoogleOAuthConfig(env);
  if (!config) {
    return undefined;
  }

  const tokenStore = createDbTokenStore(db, encryptTokenSet, decryptTokenSet);
  return createOAuthClient(config, tokenStore);
}

/**
 * Resolve userId from session.
 * Falls back to "local" for single-user Jerry installations.
 */
export async function resolveUserId(
  db: ToolContext["db"],
  sessionId: string
): Promise<string> {
  const session = await db
    .prepare("SELECT user_id FROM sessions WHERE id = ?")
    .bind(sessionId)
    .first<{ user_id: string | null }>();

  return session?.user_id ?? "local";
}
