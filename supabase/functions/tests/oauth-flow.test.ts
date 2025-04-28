import { assertEquals } from "https://deno.land/std@0.180.0/testing/asserts.ts";
import { handleOAuthFlow } from "../oauth-flow/index.ts"; // Import the specific handler
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"; // Import type for casting

// Define mock environment variables
const mockEnv = {
  clientId: "mock-client-id",
  clientSecret: "mock-client-secret",
  redirectUri: "http://localhost/oauth-flow",
  supabaseUrl: "http://localhost:54321", // Dummy URL
  serviceRoleKey: "dummy-service-key", // Dummy key
};

// Mock fetch function
const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  console.log(`[MOCK FETCH] Called with URL: ${url}`);

  // Mock Blizzard Token Exchange response
  if (url.includes("https://oauth.battle.net/token")) {
    console.log("[MOCK FETCH] Matched Token Exchange URL");
    const body = new URLSearchParams(init?.body as string);
    if (body.get("grant_type") === "authorization_code" && body.get("code") === "mock-auth-code") {
      return new Response(JSON.stringify({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        expires_in: 3600, // 1 hour
        token_type: "bearer"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Mock fetch: Invalid token exchange request", { status: 400 });
  }

  // Mock Blizzard User Info response
  if (url.includes("https://oauth.battle.net/oauth/userinfo")) {
    console.log("[MOCK FETCH] Matched User Info URL");
    if (init?.headers && (init.headers as any)["Authorization"] === "Bearer mock-access-token") {
      return new Response(JSON.stringify({
        id: 12345, // BattleNet ID
        battletag: "TestUser#1234"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Mock fetch: Unauthorized user info request", { status: 401 });
  }

  // Fallback for unhandled requests
  console.error(`[MOCK FETCH] Unhandled URL: ${url}`);
  return new Response("Mock fetch: Unhandled request", { status: 404 });
};

// Mock Supabase client object
const mockSupabaseClient = {
  from: (tableName: string) => {
    console.log(`[MOCK SB] from(${tableName}) called`);
    const fromMethods = {
      upsert: (data: any[], options?: any) => {
        console.log(`[MOCK SB] upsert([...]) on ${tableName} with data: ${JSON.stringify(data)}`);
        // Simulate successful upsert
        return Promise.resolve({ data: data, error: null });
      },
    };
    return fromMethods;
  },
};

// Mock createClient function
const mockCreateClient = (url: string, key: string) => {
  console.log(`[MOCK SB] createClient called with url: ${url}, key: ${key ? 'provided' : 'missing'}`);
  return mockSupabaseClient as unknown as SupabaseClient; // Cast to expected type
};

// Define mock dependencies
const mockDeps = {
  fetch: mockFetch,
  createClient: mockCreateClient,
};


Deno.test("oauth-flow initiates authentication redirect", async () => {
  // Simulate an initial request without a code
  const request = new Request("http://localhost/oauth-flow", {
    method: "GET",
  });

  // Call the handler directly with mocks
  const response = await handleOAuthFlow(request, mockEnv, mockDeps);

  // Assert the response is a redirect to Blizzard
  assertEquals(response.status, 302);
  const locationHeader = response.headers.get("Location");
  assertEquals(locationHeader?.startsWith("https://oauth.battle.net/authorize"), true);
  assertEquals(locationHeader?.includes(`client_id=${mockEnv.clientId}`), true);
  assertEquals(locationHeader?.includes(`redirect_uri=${encodeURIComponent(mockEnv.redirectUri)}`), true);
  assertEquals(locationHeader?.includes("scope=openid%20wow.profile"), true);

  // Check for the state cookie
  const setCookieHeader = response.headers.get("Set-Cookie");
  assertEquals(setCookieHeader?.includes("oauth_state="), true);
  assertEquals(setCookieHeader?.includes("HttpOnly"), true);
  assertEquals(setCookieHeader?.includes("Max-Age=300"), true);
});

Deno.test("oauth-flow handles callback and exchanges code for tokens", async () => {
  // Simulate a callback request with code and state
  const mockState = "mock-state-value"; // This should match the state set in the cookie
  const request = new Request(`http://localhost/oauth-flow?code=mock-auth-code&state=${mockState}`, {
    method: "GET",
    headers: {
      // Include the state cookie that would have been set by the initial redirect
      "Cookie": `oauth_state=${mockState}`,
    },
  });

  // Call the handler directly with mocks
  const response = await handleOAuthFlow(request, mockEnv, mockDeps);

  // Assert the response indicates success (or redirects to a success page)
  assertEquals(response.status, 200); // Expecting 200 for the success HTML response
  const body = await response.text();
  assertEquals(body.includes("Login successful!"), true);

  // Future: Add more detailed assertions to check mock calls (e.g., using sinon.js or similar)
});

Deno.test("oauth-flow handles state mismatch", async () => {
  // Simulate a callback request with code but incorrect state
  const request = new Request("http://localhost/oauth-flow?code=mock-auth-code&state=wrong-state", {
    method: "GET",
    headers: {
      // Include the state cookie with a different value
      "Cookie": "oauth_state=correct-state",
    },
  });

  // Call the handler directly with mocks
  const response = await handleOAuthFlow(request, mockEnv, mockDeps);

  // Assert the response indicates a state mismatch error
  assertEquals(response.status, 400);
  const body = await response.text();
  assertEquals(body, "Invalid state parameter. Authentication aborted.");
});

Deno.test("oauth-flow handles missing state cookie", async () => {
  // Simulate a callback request with code but no state cookie
  const request = new Request("http://localhost/oauth-flow?code=mock-auth-code&state=mock-state", {
    method: "GET",
    // No Cookie header
  });

  // Call the handler directly with mocks
  const response = await handleOAuthFlow(request, mockEnv, mockDeps);

  // Assert the response indicates a state mismatch error
  assertEquals(response.status, 400);
  const body = await response.text();
  assertEquals(body, "Invalid state parameter. Authentication aborted.");
});