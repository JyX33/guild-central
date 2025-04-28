# Supabase Edge Function Testing Strategy

This document outlines a strategy for testing Supabase Edge Functions within the WoW Guild Management backend. Edge Functions are serverless functions executed at the edge, built on Deno. Testing them requires considering their environment and dependencies.

## 1. Types of Tests

*   **Unit Tests:** Test individual components or functions within an Edge Function in isolation. External dependencies (like the Blizzard API or Supabase client) should be mocked.
*   **Integration Tests:** Test the interaction between different parts of an Edge Function or between the Edge Function and external services (using mocks for the external services themselves).

## 2. Testing Framework

Supabase Edge Functions run on Deno, which has a built-in test runner. We will use `Deno.test` for writing tests.

## 3. Mocking Dependencies

Edge Functions often interact with external services. To ensure tests are fast, reliable, and isolated, we need to mock these dependencies:

*   **Blizzard API:** Mock the `fetch` global function to simulate responses from the Blizzard API for different scenarios (success, errors, rate limits).
*   **Supabase Client:** Mock the Supabase client library to simulate database interactions (inserts, updates, queries) without actually hitting the database.

## 4. Testing Environment Setup

Tests will be run locally using the Deno CLI. Ensure Deno is installed and configured.

## 5. Running Tests

Tests can be run using the Deno CLI:

```bash
deno test --allow-net --allow-env <path_to_test_file>
```

*   `--allow-net`: Required if the function or its dependencies make network requests (even if mocked).
*   `--allow-env`: Required if the function reads environment variables.

## 6. Using Context7 for Documentation

The Context7 MCP server can be used to fetch documentation for libraries and technologies used in Edge Functions, such as Deno or Supabase. This can be helpful when writing tests or implementing functions.

**Example Usage (Conceptual):**

1.  **Resolve Library ID:** Use `resolve-library-id` to find the Context7 ID for a library (e.g., "deno").
2.  **Get Documentation:** Use `get-library-docs` with the resolved ID and a specific topic (e.g., "testing", "fetch", "supabase-js") to retrieve relevant documentation snippets.

This strategy provides a foundation for testing our Supabase Edge Functions effectively. The following sections will demonstrate an example implementation for the `fetch-profile` function.