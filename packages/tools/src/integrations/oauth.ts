/**
 * Shared OAuth2 authorization-code flow with encrypted token storage.
 *
 * Provides generic OAuth2 helpers for Drive, YouTube, and other integrations.
 * Tokens are encrypted at rest using AES-GCM with a key from JERRY_OAUTH_ENCRYPTION_KEY.
 *
 * Usage:
 *   const client = createOAuthClient(googleConfig, store);
 *   const authUrl = client.getAuthorizationUrl(state);
 *   // ... redirect user, receive callback with code ...
 *   await client.exchangeAuthorizationCode(userId, code);
 *   const accessToken = await client.getValidAccessToken(userId);
 */

/**
 * OAuth provider configuration.
 */
export interface OAuthProviderConfig {
  /** Provider identifier (e.g. "google") */
  provider: string;
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** Authorization endpoint URL */
  authUrl: string;
  /** Token endpoint URL */
  tokenUrl: string;
  /** Requested scopes */
  scopes: string[];
  /** Redirect URI for callback */
  redirectUri: string;
}

/**
 * Token set stored for a user.
 */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

/**
 * Encrypted token blob stored in DB.
 */
export interface EncryptedTokenBlob {
  /** Base64-encoded IV */
  iv: string;
  /** Base64-encoded ciphertext */
  ciphertext: string;
}

/**
 * Token store interface for persisting OAuth tokens.
 */
export interface TokenStore {
  /** Load tokens for a user/provider */
  load(userId: string, provider: string): Promise<TokenSet | null>;
  /** Save tokens for a user/provider */
  save(userId: string, provider: string, tokens: TokenSet): Promise<void>;
  /** Delete tokens for a user/provider */
  delete(userId: string, provider: string): Promise<void>;
}

/**
 * Derive an AES-GCM key from the environment variable.
 * Key should be a 32-byte secret (64 hex chars or 44 base64 chars).
 */
async function deriveEncryptionKey(): Promise<CryptoKey> {
  const keyEnv = process.env.JERRY_OAUTH_ENCRYPTION_KEY;
  if (!keyEnv) {
    throw new Error(
      "JERRY_OAUTH_ENCRYPTION_KEY environment variable is required for OAuth token encryption"
    );
  }

  let keyBytes: Uint8Array;

  // Try to parse as hex first (64 chars = 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(keyEnv)) {
    keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = parseInt(keyEnv.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    // Try base64 (44 chars with padding = 32 bytes)
    try {
      const decoded = atob(keyEnv);
      if (decoded.length !== 32) {
        throw new Error("Invalid key length");
      }
      keyBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        keyBytes[i] = decoded.charCodeAt(i);
      }
    } catch {
      throw new Error(
        "JERRY_OAUTH_ENCRYPTION_KEY must be 64 hex chars or 44 base64 chars (32 bytes)"
      );
    }
  }

  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt a token set using AES-GCM.
 */
export async function encryptTokenSet(
  tokens: TokenSet
): Promise<EncryptedTokenBlob> {
  const key = await deriveEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

/**
 * Decrypt an encrypted token blob.
 */
export async function decryptTokenSet(
  blob: EncryptedTokenBlob
): Promise<TokenSet> {
  const key = await deriveEncryptionKey();

  const iv = new Uint8Array(
    atob(blob.iv)
      .split("")
      .map((c) => c.charCodeAt(0))
  );
  const ciphertext = new Uint8Array(
    atob(blob.ciphertext)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  const json = new TextDecoder().decode(plaintext);
  return JSON.parse(json) as TokenSet;
}

/**
 * In-memory token store for testing.
 */
export function createMemoryTokenStore(): TokenStore {
  const tokens = new Map<string, EncryptedTokenBlob>();
  const key = (userId: string, provider: string) => `${userId}:${provider}`;

  return {
    async load(userId: string, provider: string): Promise<TokenSet | null> {
      const blob = tokens.get(key(userId, provider));
      if (!blob) return null;
      return decryptTokenSet(blob);
    },

    async save(
      userId: string,
      provider: string,
      tokenSet: TokenSet
    ): Promise<void> {
      const blob = await encryptTokenSet(tokenSet);
      tokens.set(key(userId, provider), blob);
    },

    async delete(userId: string, provider: string): Promise<void> {
      tokens.delete(key(userId, provider));
    },
  };
}

/**
 * OAuth2 client interface.
 */
export interface OAuthClient {
  /** Get authorization URL to redirect user */
  getAuthorizationUrl(state?: string): string;
  /** Exchange authorization code for tokens and store */
  exchangeAuthorizationCode(userId: string, code: string): Promise<TokenSet>;
  /** Get valid access token (refreshing if needed) */
  getValidAccessToken(userId: string): Promise<string>;
  /** Revoke tokens and delete from store */
  revoke(userId: string): Promise<void>;
}

/**
 * Token response from OAuth2 token endpoint.
 */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

/**
 * Create an OAuth2 client for a provider.
 *
 * @param config - Provider configuration
 * @param store - Token storage
 * @param fetchFn - Optional fetch function for testing
 */
export function createOAuthClient(
  config: OAuthProviderConfig,
  store: TokenStore,
  fetchFn: typeof fetch = fetch
): OAuthClient {
  return {
    getAuthorizationUrl(state?: string): string {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
      });

      if (state) {
        params.set("state", state);
      }

      return `${config.authUrl}?${params.toString()}`;
    },

    async exchangeAuthorizationCode(
      userId: string,
      code: string
    ): Promise<TokenSet> {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      });

      const response = await fetchFn(config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as TokenResponse;

      const tokens: TokenSet = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in
          ? Date.now() + data.expires_in * 1000
          : undefined,
        scope: data.scope,
        tokenType: data.token_type,
      };

      await store.save(userId, config.provider, tokens);
      return tokens;
    },

    async getValidAccessToken(userId: string): Promise<string> {
      const tokens = await store.load(userId, config.provider);
      if (!tokens) {
        throw new Error(
          `No tokens found for user ${userId} and provider ${config.provider}`
        );
      }

      // Check if token is expired (with 60s buffer)
      const isExpired =
        tokens.expiresAt && tokens.expiresAt < Date.now() + 60000;

      if (!isExpired) {
        return tokens.accessToken;
      }

      // Refresh token
      if (!tokens.refreshToken) {
        throw new Error(
          `Token expired and no refresh token available for user ${userId}`
        );
      }

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      const response = await fetchFn(config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token refresh failed: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as TokenResponse;

      const newTokens: TokenSet = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? tokens.refreshToken,
        expiresAt: data.expires_in
          ? Date.now() + data.expires_in * 1000
          : undefined,
        scope: data.scope ?? tokens.scope,
        tokenType: data.token_type ?? tokens.tokenType,
      };

      await store.save(userId, config.provider, newTokens);
      return newTokens.accessToken;
    },

    async revoke(userId: string): Promise<void> {
      await store.delete(userId, config.provider);
    },
  };
}
