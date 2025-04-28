# Edge Function Testing Best Practices

This document outlines best practices for writing tests for Supabase Edge Functions, incorporating lessons learned from developing and fixing tests for functions like `fetch-profile`, `oauth-flow`, and `sync-static-data`. Following these guidelines will help ensure your Edge Function tests are robust, maintainable, and accurately reflect the function's behavior.

## 1. Exporting Handler Functions

Edge Functions typically have a single entry point, often an asynchronous function that takes a `Request` object and returns a `Response`. To make this function testable outside the Deno/Edge Function runtime environment, it's crucial to export the core handler logic.

Instead of:

```typescript
// supabase/functions/my-function/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req: Request) => {
  // Function logic here
  return new Response("Hello, world!");
});
```

Refactor to export the handler:

```typescript
// supabase/functions/my-function/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { myHandler } from "./handler.ts"; // Assuming handler is in a separate file

serve(myHandler);

// supabase/functions/my-function/handler.ts
export async function myHandler(req: Request): Promise<Response> {
  // Function logic here
  return new Response("Hello, world!");
}
```

This allows you to import and test `myHandler` directly in your test files.

## 2. Dependency Injection

Hardcoding dependencies (like the Supabase client, external API clients, or configuration values) within your handler function makes testing difficult, as you cannot easily replace them with mocks. Implement dependency injection to pass these dependencies into your handler.

Instead of:

```typescript
// supabase/functions/my-function/handler.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.40.0'

export async function myHandler(req: Request): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );
  // Use supabase client
  const { data } = await supabase.from('my_table').select('*');
  return new Response(JSON.stringify(data));
}
```

Use dependency injection:

```typescript
// supabase/functions/my-function/handler.ts
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.40.0'

// Accept dependencies as arguments
export async function myHandler(req: Request, supabase: SupabaseClient): Promise<Response> {
  // Use injected supabase client
  const { data } = await supabase.from('my_table').select('*');
  return new Response(JSON.stringify(data));
}

// In index.ts or test file, create and pass the client:
// const supabase = createClient(...);
// myHandler(req, supabase);
```

This pattern allows you to pass mocked versions of dependencies during testing.

## 3. Proper Mocking Techniques

Effective mocking is essential for isolating the code under test and controlling the behavior of external dependencies.

* **Supabase Client:** Mock the specific methods your handler interacts with (`from`, `select`, `insert`, `update`, `delete`, `rpc`, etc.). Use `jest.fn()` to create mock functions and control their return values or thrown errors.

    ```typescript
    // Example mock for a select call
    const mockSelect = jest.fn().mockResolvedValue({ data: [{ id: 1, name: 'test' }], error: null });
    const mockFrom = jest.fn(() => ({ select: mockSelect }));
    const mockSupabase = { from: mockFrom };

    // Pass mockSupabase to your handler
    await myHandler(new Request("..."), mockSupabase as any);

    // Assertions
    expect(mockFrom).toHaveBeenCalledWith('my_table');
    expect(mockSelect).toHaveBeenCalledWith('*');
    ```

* **External APIs (e.g., Blizzard API):** If you use `fetch`, you can mock the global `fetch` function using libraries like `jest-fetch-mock` or by manually replacing `globalThis.fetch`. If you use a dedicated client library, mock the methods of that library's instance.

    ```typescript
    // Example using jest-fetch-mock
    import fetchMock from 'jest-fetch-mock';
    fetchMock.enableMocks();

    fetchMock.mockResponseOnce(JSON.stringify({ data: 'mocked response' }), { status: 200 });

    // Call the function that uses fetch
    await myHandler(...);

    expect(fetchMock).toHaveBeenCalledWith('...');
    ```

* **Mock at the Boundary:** Mock the dependency itself, not the internal implementation details of the dependency. This ensures your tests are resilient to changes within the dependency library.
* **Use `__mocks__`:** For common modules or libraries, consider creating manual mocks in a `__mocks__` directory adjacent to the module. This keeps your test files cleaner.

## 4. Environment Variable Setup

Edge Functions rely on environment variables for configuration (e.g., API keys, database URLs). In tests, you need to simulate these environment variables.

* **Using `.env.test`:** Create a `.env.test` file in your project root and load it before running tests using a library like `dotenv`.
* **Programmatic Setup:** Set `Deno.env.set()` values directly in your test setup or before calling the handler function.

    ```typescript
    // In your test file setup
    Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
    Deno.env.set('SUPABASE_ANON_KEY', 'mock_anon_key');
    // ... other variables
    ```

Ensure all necessary environment variables are set before the code that uses them is executed or imported.

## 5. Common Testing Patterns

* **Testing API Endpoints:**
  * Create a mock `Request` object with the desired method, URL, headers, and body.
  * Call your exported handler function with the mock request and any injected dependencies.
  * Assert on the returned `Response` object: check `response.status`, `response.headers`, and parse `response.json()` or `response.text()` to check the body.

    ```typescript
    const mockRequest = new Request("http://localhost/my-function", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "test" }),
    });
    const response = await myHandler(mockRequest, mockSupabase);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ output: "success" });
    ```

* **Testing Database Operations:**
  * Mock the Supabase client methods as described above.
  * Call your handler function.
  * Assert that the mocked Supabase methods were called with the expected arguments.

    ```typescript
    await myHandler(mockRequest, mockSupabase);
    expect(mockSupabase.from).toHaveBeenCalledWith('users');
    expect(mockSupabase.from('users').select).toHaveBeenCalledWith('id, name');
    ```

* **Testing Error Handling:**
  * Configure your mocks to simulate errors (e.g., `mockResolvedValue({ data: null, error: new Error('DB Error') })` for Supabase, or `fetchMock.mockRejectedValue(new Error('Network Error'))` for fetch).
  * Call your handler function.
  * Assert that the function returns an appropriate error response (e.g., status code 500, an error message in the body).

    ```typescript
    const mockSelectWithError = jest.fn().mockResolvedValue({ data: null, error: new Error('DB Error') });
    const mockFromWithError = jest.fn(() => ({ select: mockSelectWithError }));
    const mockSupabaseWithError = { from: mockFromWithError };

    const response = await myHandler(mockRequest, mockSupabaseWithError);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    ```

## 6. Troubleshooting Test Issues

* **Mocks Not Working:**
  * Ensure your mock implementation is correctly defined and located (e.g., in `__mocks__`).
  * Verify that the code under test is importing the module *after* the mock is set up (e.g., using `jest.mock()` before the import).
  * Check for circular dependencies that might cause issues with mocking.
* **Environment Variables Missing:**
  * Double-check that your `.env.test` file is correctly loaded in your test setup.
  * Ensure that all environment variables accessed by the function are set before the function is called.
  * Remember that `Deno.env.get()` returns `string | undefined`. Handle the `undefined` case in your function logic or ensure the variable is always set in tests.
* **Asynchronous Operations Not Awaited:**
  * Ensure all `async` calls within your test and the handler function are properly `await`ed.
  * Jest tests should also be `async` if they contain `await` calls.
* **Incorrect Assertions:**
  * Carefully compare the actual output/behavior with the expected output/behavior.
  * Use Jest's matchers (`.toBe()`, `.toEqual()`, `.toHaveBeenCalledWith()`, etc.) correctly.
  * When asserting on response bodies, remember to `await response.json()` or `await response.text()`.
* **Deno vs Node.js Environment:**
  * Remember that Edge Functions run in a Deno environment, while Jest typically runs in a Node.js environment. Be mindful of differences in global objects (`Deno.env` vs `process.env`, `fetch` behavior, etc.) and use appropriate polyfills or mocks where necessary. The mocking techniques described above help bridge this gap.
