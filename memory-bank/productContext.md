# Product Context

This file provides a high-level overview of the project and the expected product that will be created. Initially it is based upon projectBrief.md (if provided) and all other available project-related information in the working directory. This file is intended to be updated as the project evolves, and should be used to inform all other modes of the project's goals and context.
2025-04-28 17:06:37 - Log of updates made will be appended as footnotes to the end of this file.

*

## Project Goal

* Create a scalable, secure WoW Guild Management backend using Supabase (Postgres + Edge Functions) that operates within free-tier limits, integrating with Blizzard API for auth and data sync.

## Key Features

* Supabase Postgres with uuid-ossp, pg_cron, pgmq extensions.
* Supabase Edge Functions for Blizzard API (OAuth, data sync).
* Blizzard API integration for auth and game data (characters, guilds, static data).
* Secure token management.
* Rate limit handling via pgmq.
* RBAC based on guild ranks.
* Free-tier optimization (caching, scheduled jobs).
* Scalable design.

## Overall Architecture

* Hybrid architecture combining database scheduling (pg_cron) and serverless functions (Edge Functions) for external API calls.
* Uses Supabase Postgres with uuid-ossp, pg_cron, and pgmq extensions for data storage, scheduling, and queuing.
* Edge Functions handle Blizzard API OAuth and data fetching.
* Designed for security (secure token storage, RBAC), scalability, and efficient use of Supabase free tier and Blizzard API rate limits.
