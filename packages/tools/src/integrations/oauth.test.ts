/**
 * Unit tests for OAuth module with mock token endpoint.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createOAuthClient,
  createMemoryTokenStore,
  encryptTokenSet,
  decryptTokenSet,
  type TokenSet,
  type OAuthProviderConfig,
} from "./oauth.js";

const TEST_CONFIG: OAuthProviderConfig = {
  provider: "test",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  authUrl: "https://auth.example.com/authorize",
  tokenUrl: "https://auth.example.com/token",
  scopes: ["read", "write"],
  redirectUri: "https://app.example.com/callback",
};

const TEST_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("OAuth encryption", () => {
  beforeEach(() => {
    process.env.JERRY_OAUTH_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env.JERRY_OAUTH_ENCRYPTION_KEY;
  });

  it("encrypts and decrypts a token set", async () => {
    const tokens: TokenSet = {
      accessToken: "access_abc123",
      refreshToken: "refresh_xyz789",
      expiresAt: Date.now() + 3600000,
      scope: "read write",
      tokenType: "Bearer",
    };

    const encrypted = await encryptTokenSet(tokens);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.ciphertext);
    assert.notEqual(encrypted.ciphertext, JSON.stringify(tokens));

    const decrypted = await decryptTokenSet(encrypted);
    assert.deepEqual(decrypted, tokens);
  });

  it("ciphertext does not contain plaintext secrets", async () => {
    const tokens: TokenSet = {
      accessToken: "supersecrettoken",
      refreshToken: "refreshsecret",
    };

    const encrypted = await encryptTokenSet(tokens);
    const ciphertext = atob(encrypted.ciphertext);

    assert.ok(!ciphertext.includes("supersecrettoken"));
    assert.ok(!ciphertext.includes("refreshsecret"));
  });

  it("throws without encryption key", async () => {
    delete process.env.JERRY_OAUTH_ENCRYPTION_KEY;

    const tokens: TokenSet = { accessToken: "test" };

    await assert.rejects(
      async () => encryptTokenSet(tokens),
      /JERRY_OAUTH_ENCRYPTION_KEY environment variable is required/
    );
  });
});

describe("createMemoryTokenStore", () => {
  beforeEach(() => {
    process.env.JERRY_OAUTH_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env.JERRY_OAUTH_ENCRYPTION_KEY;
  });

  it("saves and loads tokens", async () => {
    const store = createMemoryTokenStore();
    const tokens: TokenSet = {
      accessToken: "test-access",
      refreshToken: "test-refresh",
    };

    await store.save("user-1", "google", tokens);
    const loaded = await store.load("user-1", "google");

    assert.deepEqual(loaded, tokens);
  });

  it("returns null for missing tokens", async () => {
    const store = createMemoryTokenStore();
    const loaded = await store.load("nonexistent", "google");
    assert.equal(loaded, null);
  });

  it("deletes tokens", async () => {
    const store = createMemoryTokenStore();
    const tokens: TokenSet = { accessToken: "test" };

    await store.save("user-1", "google", tokens);
    await store.delete("user-1", "google");
    const loaded = await store.load("user-1", "google");

    assert.equal(loaded, null);
  });

  it("isolates tokens by user and provider", async () => {
    const store = createMemoryTokenStore();

    await store.save("user-1", "google", { accessToken: "google-1" });
    await store.save("user-1", "youtube", { accessToken: "youtube-1" });
    await store.save("user-2", "google", { accessToken: "google-2" });

    assert.equal((await store.load("user-1", "google"))?.accessToken, "google-1");
    assert.equal((await store.load("user-1", "youtube"))?.accessToken, "youtube-1");
    assert.equal((await store.load("user-2", "google"))?.accessToken, "google-2");
  });
});

describe("createOAuthClient", () => {
  beforeEach(() => {
    process.env.JERRY_OAUTH_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env.JERRY_OAUTH_ENCRYPTION_KEY;
  });

  describe("getAuthorizationUrl", () => {
    it("builds correct authorization URL", () => {
      const store = createMemoryTokenStore();
      const client = createOAuthClient(TEST_CONFIG, store);

      const url = client.getAuthorizationUrl("state123");

      assert.ok(url.startsWith("https://auth.example.com/authorize?"));
      assert.ok(url.includes("response_type=code"));
      assert.ok(url.includes("client_id=test-client-id"));
      assert.ok(url.includes("redirect_uri="));
      assert.ok(url.includes("scope=read+write"));
      assert.ok(url.includes("state=state123"));
    });
  });

  describe("exchangeAuthorizationCode", () => {
    it("exchanges code for tokens and stores them", async () => {
      const store = createMemoryTokenStore();

      const mockFetch = async (url: string, options: RequestInit) => {
        assert.equal(url, TEST_CONFIG.tokenUrl);
        assert.equal(options.method, "POST");
        const body = new URLSearchParams(options.body as string);
        assert.equal(body.get("grant_type"), "authorization_code");
        assert.equal(body.get("code"), "auth-code-123");

        return new Response(
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200 }
        );
      };

      const client = createOAuthClient(TEST_CONFIG, store, mockFetch as typeof fetch);

      const tokens = await client.exchangeAuthorizationCode("user-1", "auth-code-123");

      assert.equal(tokens.accessToken, "new-access-token");
      assert.equal(tokens.refreshToken, "new-refresh-token");
      assert.ok(tokens.expiresAt);

      const stored = await store.load("user-1", "test");
      assert.equal(stored?.accessToken, "new-access-token");
    });

    it("throws on token endpoint error", async () => {
      const store = createMemoryTokenStore();
      const mockFetch = async () =>
        new Response("invalid_grant", { status: 400 });

      const client = createOAuthClient(TEST_CONFIG, store, mockFetch as typeof fetch);

      await assert.rejects(
        async () => client.exchangeAuthorizationCode("user-1", "bad-code"),
        /Token exchange failed: 400/
      );
    });
  });

  describe("getValidAccessToken", () => {
    it("returns valid access token without refresh", async () => {
      const store = createMemoryTokenStore();
      await store.save("user-1", "test", {
        accessToken: "valid-token",
        expiresAt: Date.now() + 3600000,
      });

      const client = createOAuthClient(TEST_CONFIG, store);
      const token = await client.getValidAccessToken("user-1");

      assert.equal(token, "valid-token");
    });

    it("refreshes expired token", async () => {
      const store = createMemoryTokenStore();
      await store.save("user-1", "test", {
        accessToken: "expired-token",
        refreshToken: "valid-refresh",
        expiresAt: Date.now() - 1000,
      });

      const mockFetch = async (_url: string, options: RequestInit) => {
        const body = new URLSearchParams(options.body as string);
        assert.equal(body.get("grant_type"), "refresh_token");
        assert.equal(body.get("refresh_token"), "valid-refresh");

        return new Response(
          JSON.stringify({
            access_token: "refreshed-token",
            expires_in: 3600,
          }),
          { status: 200 }
        );
      };

      const client = createOAuthClient(TEST_CONFIG, store, mockFetch as typeof fetch);
      const token = await client.getValidAccessToken("user-1");

      assert.equal(token, "refreshed-token");

      const stored = await store.load("user-1", "test");
      assert.equal(stored?.accessToken, "refreshed-token");
      assert.equal(stored?.refreshToken, "valid-refresh");
    });

    it("throws when no tokens exist", async () => {
      const store = createMemoryTokenStore();
      const client = createOAuthClient(TEST_CONFIG, store);

      await assert.rejects(
        async () => client.getValidAccessToken("user-1"),
        /No tokens found/
      );
    });

    it("throws when expired without refresh token", async () => {
      const store = createMemoryTokenStore();
      await store.save("user-1", "test", {
        accessToken: "expired",
        expiresAt: Date.now() - 1000,
      });

      const client = createOAuthClient(TEST_CONFIG, store);

      await assert.rejects(
        async () => client.getValidAccessToken("user-1"),
        /no refresh token available/
      );
    });
  });

  describe("revoke", () => {
    it("deletes tokens from store", async () => {
      const store = createMemoryTokenStore();
      await store.save("user-1", "test", { accessToken: "to-revoke" });

      const client = createOAuthClient(TEST_CONFIG, store);
      await client.revoke("user-1");

      const loaded = await store.load("user-1", "test");
      assert.equal(loaded, null);
    });
  });
});

describe("error handling does not leak secrets", () => {
  beforeEach(() => {
    process.env.JERRY_OAUTH_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env.JERRY_OAUTH_ENCRYPTION_KEY;
  });

  it("token endpoint errors do not contain secrets", async () => {
    const store = createMemoryTokenStore();
    const mockFetch = async (_url: string) =>
      new Response("error details", { status: 400 });

    const client = createOAuthClient(
      { ...TEST_CONFIG, clientSecret: "supersecret" },
      store,
      mockFetch as typeof fetch
    );

    try {
      await client.exchangeAuthorizationCode("user-1", "code");
      assert.fail("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      assert.ok(!message.includes("supersecret"));
      assert.ok(!message.includes(TEST_CONFIG.clientSecret));
    }
  });
});
