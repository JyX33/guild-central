import { assertEquals } from "https://deno.land/std@0.180.0/testing/asserts.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Mock the global fetch function
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);

  // Mock Blizzard API response for fetching character profile
  if (url.includes("api.blizzard.com/profile/wow/character")) {
    // Simulate a successful response
    return new Response(JSON.stringify({
      id: 123,
      name: "TestCharacter",
      realm: "TestRealm",
      level: 60,
      // ... other profile data
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Add other mock responses for different URLs if needed

  // Fallback for unhandled requests (optional)
  // return originalFetch(input, init); // Commented out to ensure only mocked calls are made
  return new Response("Mock fetch: Unhandled request", { status: 404 });
};

// Mock the Supabase client
// This is a simplified mock. A real mock would need to handle specific method calls (from, insert, update, etc.)
const mockSupabaseClient = {
  from: (tableName: string) => ({
    update: (data: any) => ({
      eq: (column: string, value: any) => ({
        select: () => ({
          single: () => ({
            data: { id: 'test-user-id', character_id: 123, character_name: 'TestCharacter' },
            error: null,
          }),
        }),
      }),
    }),
    // Add mock for select if needed for other parts of the function
    select: (columns: string) => ({
      match: (filter: any) => ({
        single: () => {
          // Simulate finding a user
          if (tableName === 'users' && (filter.id === 'test-user-id' || filter.battlenet_id === 12345)) {
            return { data: { id: 'test-user-id', battlenet_id: 12345, access_token: 'mock-blizzard-token' }, error: null };
          }
          return { data: null, error: new Error("User not found in mock DB") };
        },
      }),
      eq: (column: string, value: any) => ({
         // Simulate finding existing characters for cleanup
        then: (callback: (result: any) => any) => {
           if (tableName === 'characters' && column === 'user_id' && value === 'test-user-id') {
             // Simulate no existing characters for simplicity in this test
             return callback({ data: [], error: null });
           }
           return callback({ data: null, error: new Error("Mock select eq not implemented for this case") });
        }
      })
    }),
     upsert: (data: any[], options: any) => ({
       select: (columns: string) => ({
         // Simulate upserting guilds and returning mock IDs
         then: (callback: (result: any) => any) => {
           if (tableName === 'guilds') {
             const mockGuilds = data.map((g, index) => ({ ...g, id: `mock-guild-id-${index}` }));
             return callback({ data: mockGuilds, error: null });
           }
            if (tableName === 'characters') {
             // Simulate successful character upsert
             return callback({ data: data, error: null });
           }
           return callback({ data: null, error: new Error("Mock upsert not implemented for this table") });
         }
       })
     }),
     delete: () => ({
       match: (filter: any) => ({
         // Simulate successful delete
         then: (callback: (result: any) => any) => {
           return callback({ data: null, error: null });
         }
       })
     })
  }),
};

// Mock the createClient function from supabase-js
// @ts-ignore: Mocking a global function
globalThis.createClient = () => mockSupabaseClient;


// Mock the serve function to capture the handler
let capturedHandler: (req: Request) => Promise<Response>;
// @ts-ignore: Mocking a global function
globalThis.serve = async (handler: (req: Request) => Promise<Response>) => {
  capturedHandler = handler;
  // Prevent the server from actually starting during tests
  return new Promise(() => {});
};

// Import the actual Edge Function code (this will call the mocked serve)
import "./index.ts";

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

  // Call the Edge Function handler
  const response = await capturedHandler(request);

  // Assert the response status and body
  assertEquals(response.status, 200);
  const body = await response.text(); // Use text() as the response is a string message
  assertEquals(body, "Profile sync completed for user 12345. Characters updated: 1"); // Updated expected message based on index.ts output

  // Add more assertions here to check if the Supabase client mock was called correctly
  // This would require a more sophisticated mock that tracks calls.
});

// Restore original fetch and createClient after tests (optional, but good practice)
// globalThis.fetch = originalFetch;
// globalThis.createClient = originalCreateClient;
// globalThis.serve = originalServe;