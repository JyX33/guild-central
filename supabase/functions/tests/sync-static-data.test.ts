import { assertEquals } from "https://deno.land/std@0.180.0/testing/asserts.ts";
import { handleSyncStaticData } from "../sync-static-data/index.ts"; // Import the specific handler
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"; // Import type for casting

// Define mock environment variables
const mockEnv = {
  clientId: "mock-client-id",
  clientSecret: "mock-client-secret",
  apiRegion: "us",
  locale: "en_US",
  supabaseUrl: "http://localhost:54321", // Dummy URL
  serviceRoleKey: "dummy-service-key", // Dummy key
};

// Mock fetch function
const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  console.log(`[MOCK FETCH] Called with URL: ${url}`);

  // Mock Blizzard Client Credentials Token response
  if (url.includes("https://oauth.battle.net/token")) {
    console.log("[MOCK FETCH] Matched Client Token URL");
    const body = new URLSearchParams(init?.body as string);
    if (body.get("grant_type") === "client_credentials") {
      return new Response(JSON.stringify({
        access_token: "mock-app-access-token",
        expires_in: 3600, // 1 hour
        token_type: "bearer"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Mock fetch: Invalid client token request", { status: 400 });
  }

  // Mock Playable Classes response
  if (url.includes("https://us.api.blizzard.com/data/wow/playable-class/index")) {
    console.log("[MOCK FETCH] Matched Playable Classes URL");
    return new Response(JSON.stringify({
      classes: [
        { id: 1, name: { [mockEnv.locale]: "Warrior" } }, // Use mockEnv.locale
        { id: 2, name: { [mockEnv.locale]: "Paladin" } },
      ]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Mock Playable Races response
  if (url.includes("https://us.api.blizzard.com/data/wow/playable-race/index")) {
    console.log("[MOCK FETCH] Matched Playable Races URL");
    return new Response(JSON.stringify({
      races: [
        { id: 1, name: { [mockEnv.locale]: "Human" }, faction: { name: { [mockEnv.locale]: "Alliance" } } },
        { id: 2, name: { [mockEnv.locale]: "Orc" }, faction: { name: { [mockEnv.locale]: "Horde" } } },
      ]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Mock Realms response
  if (url.includes("https://us.api.blizzard.com/data/wow/realm/index")) {
    console.log("[MOCK FETCH] Matched Realms URL");
    return new Response(JSON.stringify({
      realms: [
        { id: 1, name: { [mockEnv.locale]: "Test Realm 1" }, slug: "test-realm-1" },
        { id: 2, name: { [mockEnv.locale]: "Test Realm 2" }, slug: "test-realm-2" },
      ]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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


Deno.test("sync-static-data fetches and upserts static data", async () => {
  // Call the handler directly with mocks (no request object needed)
  const response = await handleSyncStaticData(mockEnv, mockDeps);

  // Assert the response indicates success
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.message, "Static data sync complete. Classes: 2, Races: 2, Realms: 2 updated.");
  assertEquals(body.classes, 2);
  assertEquals(body.races, 2);
  assertEquals(body.realms, 2);

  // Future: Add more detailed assertions to check mock calls (e.g., using sinon.js or similar)
});