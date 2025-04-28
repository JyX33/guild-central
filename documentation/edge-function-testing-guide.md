# Edge Function Testing Guide

This guide provides practical steps for running the Edge Function tests for the WoW Guild Management backend, including how to leverage the Context7 MCP server for documentation assistance during development and troubleshooting.

Refer to the [Edge Function Testing Strategy](edge-function-testing-strategy.md) for the overall approach.

## Prerequisites

1. **Supabase CLI:** Ensure you have the Supabase CLI installed and configured. ([Installation Guide](https://supabase.com/docs/guides/cli/getting-started))
2. **Deno:** Edge Functions run on Deno. Make sure you have Deno installed. ([Installation Guide](https://deno.land/manual/getting_started/installation))
3. **Environment Variables:** Tests might require specific environment variables (e.g., Supabase URL, anon key, mock API keys). Ensure you have a `.env` file within the specific function's directory (e.g., `supabase/functions/fetch-profile/.env`) or have them loaded into your testing environment. Consult the `supabase/.env.example` file for required variables.

## Running Tests

Edge Function tests are typically written using Deno's built-in testing tools.

1. **Navigate to the Function Directory:** Open your terminal and change to the directory of the Edge Function you want to test.

    ```bash
    # PowerShell Example (Windows)
    cd supabase\functions\<function-name>
    # Example:
    cd supabase\functions\fetch-profile

    # Bash Example (Linux/macOS)
    cd supabase/functions/<function-name>
    # Example:
    cd supabase/functions/fetch-profile
    ```

2. **Run Deno Test:** Execute the Deno test runner. You'll need to grant necessary permissions (like network access for mocks or environment variable access).

    ```bash
    # Basic test command for the current directory
    deno test --allow-env --allow-net

    # Run specific test files
    deno test --allow-env --allow-net <test-file-name>.test.ts
    # Example:
    deno test --allow-env --allow-net fetch-profile.test.ts
    ```

    * `--allow-env`: Grants permission to access environment variables (like those in `.env`).
    * `--allow-net`: Grants network permissions (often needed for mocking HTTP requests or if tests interact with local Supabase services). Adjust permissions as needed based on the test requirements. Add other flags like `--allow-read` or `--allow-write` if tests interact with the filesystem.

3. **Review Output:** The test runner will output the results, indicating passing or failing tests and any errors encountered.

*(Note: While `supabase functions test <function-name>` exists, it might have limitations or different behavior compared to directly using `deno test` within the function's directory, which is often preferred for more control over the Deno environment and permissions.)*

## Using Context7 MCP for Documentation

When writing or debugging tests, you might need to look up documentation for Deno, Supabase libraries, or other dependencies. The Context7 MCP server can help fetch relevant documentation directly.

**Example Scenario:** You are writing a test for `fetch-profile` and need to understand how to properly mock `fetch` calls using Deno's standard library or check the API for the Supabase JS client.

1. **Resolve Library ID:** First, find the Context7-compatible ID for the library you need.

    *Example Request to Context7 MCP (Find Deno std lib ID):*

    ```xml
    <use_mcp_tool>
      <server_name>context7</server_name>
      <tool_name>resolve-library-id</tool_name>
      <arguments>
      {
        "libraryName": "Deno Standard Library"
      }
      </arguments>
    </use_mcp_tool>
    ```

    *(You would receive a response containing potential matches and their IDs, e.g., `deno/std`)*

    *Example Request to Context7 MCP (Find supabase-js ID):*

    ```xml
    <use_mcp_tool>
      <server_name>context7</server_name>
      <tool_name>resolve-library-id</tool_name>
      <arguments>
      {
        "libraryName": "supabase-js"
      }
      </arguments>
    </use_mcp_tool>
    ```

    *(You would receive a response containing potential matches and their IDs, e.g., `supabase/supabase-js`)*

2. **Get Library Documentation:** Use the resolved ID to fetch documentation on a specific topic.

    *Example Request to Context7 MCP (Get Deno mocking docs):*

    ```xml
    <use_mcp_tool>
      <server_name>context7</server_name>
      <tool_name>get-library-docs</tool_name>
      <arguments>
      {
        "context7CompatibleLibraryID": "deno/std", 
        "topic": "mocking fetch http requests"
      }
      </arguments>
    </use_mcp_tool>
    ```

    *(You would receive relevant documentation snippets about mocking network requests in Deno tests.)*

    *Example Request to Context7 MCP (Get Supabase client docs):*

    ```xml
    <use_mcp_tool>
      <server_name>context7</server_name>
      <tool_name>get-library-docs</tool_name>
      <arguments>
      {
        "context7CompatibleLibraryID": "supabase/supabase-js",
        "topic": "createClient options"
      }
      </arguments>
    </use_mcp_tool>
    ```

    *(You would receive documentation about the `createClient` function and its parameters.)*

## Troubleshooting Common Issues

* **Permission Denied Errors:**
  * **Problem:** `deno test` fails with errors like `PermissionDenied: Requires net access to "0.0.0.0:80", run again with the --allow-net flag`.
  * **Solution:** Add the required permission flags (`--allow-net`, `--allow-env`, `--allow-read`, etc.) to your `deno test` command based on the error message.

* **Environment Variables Not Loaded:**
  * **Problem:** Tests fail because expected environment variables (e.g., `SUPABASE_URL`) are undefined.
  * **Solution:**
    * Ensure you have a `.env` file in the *function's directory* (e.g., `supabase/functions/fetch-profile/.env`).
    * Make sure you are running `deno test` with the `--allow-env` flag.
    * Verify the variable names in your `.env` file match exactly what the code expects.

* **Import Errors:**
  * **Problem:** Tests fail with errors like `error: Module not found`.
  * **Solution:**
    * Check the import paths in your test file and the function code. Ensure they are correct relative to the function's directory.
    * Run `deno cache --reload <path-to-problematic-import>` or `deno cache --reload <function-entrypoint.ts>` to refresh potentially corrupted cache entries.

* **Mocking Failures:**
  * **Problem:** Network requests or other dependencies are not being mocked correctly, leading to unexpected test failures or actual external calls.
  * **Solution:**
    * Double-check your mocking setup. Ensure the mock implementation correctly intercepts the intended calls (e.g., mocking `globalThis.fetch`).
    * Verify the mock returns the expected data structure or error.
    * Use `console.log` within your mocks and the code under test to trace the execution flow and see if the mock is being hit.
    * Consult Deno documentation (potentially via Context7 MCP) for the specific mocking library or technique you are using.

* **Async Issues / Timeouts:**
  * **Problem:** Tests involving asynchronous operations hang or time out.
  * **Solution:**
    * Ensure you are correctly using `async`/`await` in your test functions and any asynchronous code they call.
    * Make sure promises are properly resolved or rejected. Unhandled promises can cause tests to hang.
    * Increase test timeouts if necessary, although this often indicates an underlying issue in the test or code. Deno's default timeout is usually sufficient.
