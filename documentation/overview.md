# Guild Central Backend Overview

This document provides an overview of the **Guild Central** backend architecture for a World of Warcraft (WoW) Guild Management application. The backend is built on **Supabase** (Postgres) with serverless **Edge Functions**, leveraging PostgreSQL extensions like **pg_cron** for scheduling and **pgmq** for queuing. Integration with Blizzard’s Battle.net API is used for authenticating users and syncing game data (characters, guilds, static data such as classes and realms). The goal is to create a scalable, secure backend that operates within Supabase’s free-tier limits while providing robust guild management features.

## Architecture Summary

The Guild Central backend follows a **hybrid architecture** that combines database-centric scheduling with serverless functions for external API interactions. Key components include:

- **Supabase Postgres Database** – Stores all application data (users, characters, guilds, etc.) and runs scheduled jobs. It has extensions enabled for UUID generation, cron jobs, and message queuing.
- **Postgres Extensions** –
  - `uuid-ossp` is used to generate UUID primary keys for consistent identifiers.
  - `pg_cron` is used to schedule periodic tasks (e.g. data sync jobs) directly in the database ([WoW Guild Backend Plan_.pdf](file://file-LPSH3juMbB994ZgKbSPLTY#:~:text=within%20the%20cron%20command%20is,pgmq)) ([WoW Guild Backend Plan_.pdf](file://file-LPSH3juMbB994ZgKbSPLTY#:~:text=%E2%97%8F%20Assessment%3A%20pg_cron%20is%20well,It%20is)).
  - `pgmq` provides a lightweight, durable message queue within Postgres for managing background tasks ([WoW Guild Backend Plan_.pdf](file://file-LPSH3juMbB994ZgKbSPLTY#:~:text=%E2%97%8F%20pgmq%3A%20A%20Supabase,18)) ([WoW Guild Backend Plan_.pdf](file://file-LPSH3juMbB994ZgKbSPLTY#:~:text=%E2%97%8B%20Limitations%3A%20Requires%20consumers%20,under%20extreme%20load%20needs%20consideration)).
- **Supabase Edge Functions** – Written in TypeScript and deployed to Supabase’s Deno runtime, these functions handle **Blizzard API** interactions (OAuth 2.0 flow and data fetches). They act as the “workers” that perform HTTP requests to Blizzard and update the database.
- **Blizzard Battle.net API Integration** – Utilizes Blizzard’s OAuth2 Authorization Code flow for user authentication and **REST API** calls for game data. The backend securely manages OAuth tokens and calls Blizzard endpoints for profile data (e.g., character info, guild roster) and static game data (classes, races, realms).
- **Security & Scalability** – OAuth tokens are stored securely (never exposed on the client), and the system is designed to respect Blizzard API rate limits (e.g., by queueing tasks and processing them sequentially). Role-Based Access Control (RBAC) can be implemented based on WoW guild ranks stored in the database (guild leaders, officers, etc.), ensuring only authorized users can perform certain actions. The design prioritizes using Supabase’s free tier efficiently by caching static data and scheduling infrequent sync jobs to minimize bandwidth and compute usage.

## Repository Structure

Inside the project directory `f:/Projects/guild-central-backend/`, the following folder structure is expected:

```plaintext
guild-central-backend/
├── supabase/
│   ├── migrations/          # SQL migration files for database schema & extensions
│   │   ├── 20250428120000_init.sql            # Initial schema (users, guilds, characters, etc.)
│   │   ├── 20250428121000_enable_extensions.sql   # Enable uuid-ossp, pg_cron, pgmq
│   │   └── 20250428121500_static_data_schema.sql  # Tables for classes, races, realms
│   ├── functions/           # Edge Functions (Deno runtime)
│   │   ├── oauth-flow/
│   │   │   └── index.ts     # OAuth2 authorization code flow handler (Blizzard login callback)
│   │   ├── sync-static-data/
│   │   │   └── index.ts     # Fetches static game data (classes, races, realms) from Blizzard API
│   │   ├── fetch-profile/
│   │   │   └── index.ts     # Fetches a user's WoW profile (characters, guilds) using their token
│   │   └── ...              # (Additional Edge Functions, e.g., for guild roster sync or others)
│   ├── .env.example         # Example environment variables for local development
│   ├── config.toml          # Supabase configuration (project ID, database connection settings)
│   └── README.md            # (Optional) summary or pointer to docs
└── *.md                     # Documentation files (overview.md, project-setup.md, etc.)
```

*Note:* The actual timestamp prefixes on migration files will differ; they are shown here for illustration. The `supabase/` directory is created by the Supabase CLI and contains all backend code and config. Edge Function directories (e.g. `oauth-flow`) each contain an `index.ts` with the function’s code.

## Included Documentation

This overview is accompanied by three detailed specification documents that guide you through every aspect of the implementation:

- **[Project Setup & Initialization](project-setup.md)** – Step-by-step instructions to set up the development environment on Windows, initialize the Supabase project, enable required extensions (UUID, cron, queue), configure secrets, and scaffold the project structure.
- **[Blizzard OAuth2 Implementation](blizzard-auth-implementation.md)** – In-depth guide to implementing the Blizzard **OAuth 2.0 Authorization Code Flow** in an Edge Function (`oauth-flow`). This covers redirecting users to Battle.net, handling the callback, exchanging the code for tokens, verifying state (CSRF protection), storing tokens securely, and configuring Supabase secrets for the client ID/secret.
- **[Blizzard API Data Access](blizzard-api-access.md)** – Details on integrating with Blizzard’s WoW API for data syncing. It explains how to create Edge Functions to fetch **static game data** (like classes, races, realms) and **dynamic profile data** (player characters, guild membership). This includes example API requests/responses, how to store this data in Postgres (schema design and SQL migrations for tables), and patterns for scheduling these sync tasks (using `pg_cron` and `pgmq` for queueing as needed).

Each of the above documents is highly detailed, containing TypeScript code examples for Edge Functions and SQL examples for database migrations. They are written for experienced developers, with clarity and step-by-step explanations to ensure a smooth implementation.

## Environment Variables (.env)

The project requires certain configuration secrets to run, especially for connecting to Blizzard’s API. Below is a sample `.env.example` file illustrating the required variables:

```bash
# Supabase Project Keys (for local development and Edge Function access to DB)
SUPABASE_URL=http://localhost:54321       # URL of the local Supabase instance (if using supabase start)
SUPABASE_ANON_KEY=public-anon-key         # Public anon key (not used on server, but included for completeness)
SUPABASE_SERVICE_ROLE_KEY=service-role-key# Service role key for server-side requests (use with caution)

# Blizzard API OAuth Credentials (obtain from Blizzard Developer Portal)
BLIZZARD_CLIENT_ID=your_blizzard_client_id
BLIZZARD_CLIENT_SECRET=your_blizzard_client_secret
BLIZZARD_OAUTH_REDIRECT_URI=https://<PROJECT_REF>.functions.supabase.co/oauth-flow

# Blizzard API configuration
BLIZZARD_API_REGION=us            # Default region for API calls (us, eu, etc.)
BLIZZARD_API_LOCALE=en_US         # Locale for data (en_US for English)
```

**Notes:**

- The `SUPABASE_SERVICE_ROLE_KEY` is used by Edge Functions to securely interact with your database (bypassing Row Level Security as needed). In local development, these values are set by the Supabase CLI when you start the services. In production (Supabase Cloud), you will set these values using `supabase secrets`.
- `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` are obtained by registering your application on the **Blizzard Battle.net Developer Portal**. Never commit actual secret values to source control – use environment-specific secrets. In Supabase Cloud, you can run `supabase secrets set BLIZZARD_CLIENT_ID="xxx" BLIZZARD_CLIENT_SECRET="yyy"` to store them securely.
- `BLIZZARD_OAUTH_REDIRECT_URI` must exactly match one of the redirect URLs you register in the Blizzard Developer Portal for your OAuth client. For a Supabase project, a common pattern is to use the deployed Edge Function URL (which is of the form `https://<project>.functions.supabase.co/oauth-flow` for the function named "oauth-flow"). For local testing, Blizzard’s OAuth may not allow a plain HTTP localhost redirect; one workaround is to use a tool like Ngrok to provide an HTTPS tunnel to your local function endpoint, or deploy to a test Supabase project.

## Free-Tier Considerations

This architecture is designed to work within Supabase’s free tier limits and Blizzard API’s constraints:

- **Supabase Limits:** The free tier imposes limits on database size, bandwidth, and Edge Function execution time. We minimize external API calls by caching static data (classes, races, etc.) in the database and only updating it infrequently (e.g., monthly or after major game patches). Expensive operations (like refreshing all guild rosters) are scheduled during off-peak times and divided into smaller tasks to avoid long function execution times. Edge Functions on Supabase have a limited execution time (for example, ~5 seconds on free tier); long-running sync tasks are broken up using the message queue (pgmq) and processed incrementally to avoid timeouts.
- **Blizzard API Rate Limits:** Blizzard’s APIs have strict rate limits (e.g., 100 requests per second in some cases). To stay within these limits and avoid being throttled or banned, the backend uses the `pgmq` queue to buffer API requests. For instance, if many characters need updating at once, tasks are enqueued and a worker function processes them one by one (or in controlled batches), ensuring we never exceed the rate limit. Additionally, we implement retry logic and backoff in the Edge Functions for robustness on intermittent failures.
- **Secure Data Handling:** All sensitive data (Blizzard access tokens, refresh tokens, user personal info) is kept server-side. Access tokens last about 24 hours ([WoW Guild Backend Plan_.pdf](file://file-LPSH3juMbB994ZgKbSPLTY#:~:text=%E2%97%8B%20expires_in%3A%20The%20lifetime%20of,3)) ([WoW Guild Backend Plan_.pdf](file://file-LPSH3juMbB994ZgKbSPLTY#:~:text=%E2%97%8F%20Token%20Usage%3A%20Access%20tokens,6)), so the system refreshes or re-authenticates users as needed in a secure manner. Tokens are stored encrypted in the database (using a technique like PGCrypto or Supabase’s Vault) to mitigate the impact of any data breach.
- **Scalability:** While the solution targets the free tier initially, it’s designed to scale. By using a combination of database scheduling and stateless functions, we can easily move background processing to more robust infrastructure if needed (for example, migrating Edge Function logic to a dedicated server or increasing the Supabase plan for more throughput). The modular design (separate functions for auth, data sync, etc.) ensures that each concern can be scaled or optimized independently.

---

With this overview in mind, you can proceed to the detailed guides for setup, OAuth implementation, and API data access. Each section of the system is documented with code examples and explanations to assist you in building the Guild Central backend step by step. Use the links above to navigate to the specific documentation as needed. Enjoy building your guild management platform!
