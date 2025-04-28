import { assertEquals } from "https://deno.land/std@0.180.0/testing/asserts.ts";

// Set required environment variables for Supabase client BEFORE importing the handler
Deno.env.set("SUPABASE_URL", "http://localhost:54321"); // Dummy URL
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy-service-key"); // Dummy key

// Import the specific handler function, not the whole module for side effects
import { fetchProfileHandler } from "../fetch-profile/index.ts";

// Mock the global fetch function
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  console.log(`[MOCK FETCH] Called with URL: ${url}`); // Log fetch calls

  // Mock Blizzard API response for fetching ACCOUNT profile summary
  if (url.includes("api.blizzard.com/profile/user/wow")) {
    console.log("[MOCK FETCH] Matched Account Profile URL");
    return new Response(JSON.stringify({
      _links: { self: { href: "..." } },
      id: 12345, // Battlenet ID
      wow_accounts: [
        {
          id: 54321,
          characters: [
            {
              character: { href: "...", name: "TestCharacter", id: 123 },
              protected_character: { href: "..." },
              name: "TestCharacter",
              id: 123,
              realm: { key: { href: "..." }, name: "TestRealm", id: 1, slug: "testrealm" },
              playable_class: { key: { href: "..." }, name: "Warrior", id: 1 },
              playable_race: { key: { href: "..." }, name: "Human", id: 1 },
              gender: { type: "MALE", name: "Male" },
              faction: { type: "ALLIANCE", name: "Alliance" },
              level: 60,
            },
            // Add more mock characters here if needed for other tests
          ],
        },
      ],
      collections: { href: "..." },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Mock Blizzard API response for fetching CHARACTER profile
  if (url.includes("api.blizzard.com/profile/wow/character")) {
    console.log("[MOCK FETCH] Matched Character Profile URL");
    // Simulate a successful response
    // Ensure this matches the character from the account profile mock above
    const characterName = url.split('/')[6]?.toLowerCase(); // Extract name from URL
    const realmSlug = url.split('/')[5]?.toLowerCase(); // Extract realm from URL

    // Only return success if it matches our mock character
    if (characterName === "testcharacter" && realmSlug === "testrealm") {
      return new Response(JSON.stringify({
        id: 123,
        name: "TestCharacter", // Use consistent casing
        realm: { slug: "testrealm", name: "TestRealm" }, // Use consistent casing
        level: 60,
        guild: { // Add mock guild info
           name: "Mock Guild",
           realm: { slug: "testrealm", name: "TestRealm" },
           id: 987
        }
        // ... other profile data
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
       console.warn(`[MOCK FETCH] Character profile request for ${characterName}-${realmSlug} did not match expected mock.`);
       return new Response("Mock fetch: Character not found", { status: 404 });
    }
  }

  // Fallback for unhandled requests (optional)
  console.error(`[MOCK FETCH] Unhandled URL: ${url}`); // Log unhandled URLs
  // return originalFetch(input, init); // Commented out to ensure only mocked calls are made
  return new Response("Mock fetch: Unhandled request", { status: 404 });
};

// Mock the Supabase client (Revised Structure)
const mockSupabaseClient = {
  from: (tableName: string) => {
    const fromMethods = {
      // UPDATE Mock (kept for completeness, might not be used)
      update: (data: any) => {
        const updateMethods = {
          eq: (column: string, value: any) => {
            const eqMethods = {
              select: () => {
                const selectMethods = {
                  single: () => {
                    console.log(`[MOCK SB] update().eq(${column}, ${value}).select().single() on ${tableName}`);
                    // Basic mock return for update
                    return Promise.resolve({ data: { id: 'test-user-id', ...data }, error: null }); // Return Promise
                  }
                };
                return selectMethods;
              }
            };
            return eqMethods;
          }
        };
        return updateMethods;
      },
      // SELECT Mock
      select: (columns: string) => {
        const selectMethods = {
          match: (filter: any) => {
            const matchMethods = {
              single: () => {
                console.log(`[MOCK SB] select().match(${JSON.stringify(filter)}).single() on ${tableName}`);
                // Simulate finding a user
                if (tableName === 'users' && (filter.id === 'test-user-id' || filter.battlenet_id === 12345)) {
                  return Promise.resolve({ data: { id: 'test-user-id', battlenet_id: 12345, access_token: 'mock-blizzard-token', battletag: 'TestUser#1234' }, error: null }); // Return Promise
                }
                return Promise.resolve({ data: null, error: new Error(`Mock 'select().match().single()' failed for table '${tableName}' with filter ${JSON.stringify(filter)}`) }); // Return Promise
              }
            };
            return matchMethods;
          },
          eq: (column: string, value: any) => {
             console.log(`[MOCK SB] select().eq(${column}, ${value}) on ${tableName}`);
             // Simulate finding existing characters for cleanup (index.ts line 162)
             // This path in Supabase v2 returns the data directly, not requiring .then()
             if (tableName === 'characters' && column === 'user_id' && value === 'test-user-id') {
               // Simulate no existing characters for simplicity
               return Promise.resolve({ data: [], error: null }); // Return Promise
             }
             // Default return if no specific mock matches eq
             return Promise.resolve({ data: null, error: new Error(`Mock 'select().eq()' not implemented for table '${tableName}', column '${column}'`) }); // Return Promise
          }
        };
        return selectMethods;
      },
      // UPSERT Mock
      upsert: (data: any[], options?: any) => {
        const upsertMethods = {
          select: (columns?: string) => {
            console.log(`[MOCK SB] upsert([...]).select() on ${tableName}`);
            // Simulate upserting guilds and returning mock IDs
            if (tableName === 'guilds') {
              const mockGuilds = data.map((g, index) => ({ ...g, id: `mock-guild-id-${index}` }));
              return Promise.resolve({ data: mockGuilds, error: null }); // Return Promise
            }
             if (tableName === 'characters') {
              // Simulate successful character upsert
              return Promise.resolve({ data: data, error: null }); // Return Promise
            }
            return Promise.resolve({ data: null, error: new Error(`Mock 'upsert().select()' not implemented for table '${tableName}'`) }); // Return Promise
          }
        };
        return upsertMethods;
      },
      // DELETE Mock
      delete: () => {
        const deleteMethods = {
          match: (filter: any) => {
            console.log(`[MOCK SB] delete().match(${JSON.stringify(filter)}) on ${tableName}`);
            // Simulate successful delete
            return Promise.resolve({ data: null, error: null }); // Return Promise
          }
        };
        return deleteMethods;
      }
    };
    return fromMethods;
  },
};

Deno.test("fetch-profile retrieves and updates character data", async () => {
  // Simulate a request to the Edge Function
  const request = new Request("http://localhost/fetch-profile?user_id=test-user-id", {
    method: "GET", // Changed to GET based on index.ts reading searchParams
    headers: {
      "Content-Type": "application/json",
      // Include any necessary headers, e.g., Authorization
      // "Authorization": "Bearer mock-blizzard-token", // Not needed as token is fetched from mock DB
    },
    // body: JSON.stringify({ // Body is not used for GET request with search params
    //   userId: "test-user-id",
    //   characterName: "TestCharacter",
    //   realmSlug: "testrealm",
    // }),
  });

  // Remove the mock verification logs

  // Call the imported Edge Function handler directly, passing the mock client
  // Note: We need to cast mockSupabaseClient to 'any' or a compatible SupabaseClient type
  // because our mock object might not perfectly match the full SupabaseClient interface.
  // Using 'any' is simpler for now.
  const response = await fetchProfileHandler(request, mockSupabaseClient as any);

  // Assert the response status and body
  assertEquals(response.status, 200);
  const body = await response.text(); // Handler returns text, not JSON
  // Check the exact string based on the mock data (1 character expected from mock fetch)
  // Note: The mock fetch currently returns a generic character profile. We need to ensure it aligns
  // with the account profile mock to result in exactly 1 character being processed.
  // For now, let's assume the mocks are set up to yield 1 character.
  assertEquals(body, "Profile sync completed for user TestUser#1234. Characters updated: 1");

  // Add more assertions here to check if the Supabase client mock was called correctly
  // This would require a more sophisticated mock that tracks calls.
});

// Restore original fetch and createClient after tests (optional, but good practice)
// globalThis.fetch = originalFetch;
// globalThis.createClient = originalCreateClient;
// globalThis.serve = originalServe;