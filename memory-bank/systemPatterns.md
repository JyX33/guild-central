# System Patterns *Optional*

This file documents recurring patterns and standards used in the project.
It is optional, but recommended to be updated as the project evolves.
2025-04-28 17:06:55 - Log of updates made.

2025-04-28 17:41:30 - Added Edge Function testing patterns.
*

## Coding Patterns

* Edge Functions written in TypeScript.
* SQL for database migrations.

## Architectural Patterns

* Hybrid: Database-scheduled jobs (`pg_cron`), message queue (`pgmq`), serverless functions (Supabase Edge Functions) for external API calls.

## Testing Patterns

* Utilize Supabase CLI for local testing (`supabase functions test`).
* Mock external dependencies (like Blizzard API) using libraries like `msw` or Jest's mocking features.
* Employ Jest as the test runner and assertion library.
* Structure tests within `supabase/functions/<function-name>/<function-name>.test.ts`.
* Leverage Context7 MCP for documentation retrieval during test development (see `scripts/context7-demo.js`).
* Refer to `documentation/edge-function-testing-strategy.md` and `documentation/edge-function-testing-guide.md` for detailed guidance.
