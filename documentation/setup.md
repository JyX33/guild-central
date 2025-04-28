# Project Setup and Initialization

In this document, we will walk through setting up the Guild Central backend project on a Windows machine (using VSCode and PowerShell) and initializing a Supabase project. By the end of these steps, you will have a local Supabase environment running with the required extensions enabled (**uuid-ossp**, **pg_cron**, **pgmq**), the basic project folder structure in place (including Edge Function directories), and the necessary secrets configured.

## Prerequisites

- **Node.js and npm:** Ensure you have Node.js installed (for the Supabase CLI and general development). The Edge Functions will be written in TypeScript, which will be transpiled to run in Deno – Node is mainly needed for tooling.
- **Supabase CLI:** Install the Supabase CLI by running `npm install -g supabase`. This gives you the `supabase` command used to manage the local development setup and deploy functions.  
- **Docker:** Supabase’s local development relies on Docker to spin up a Postgres database and other services. Install Docker Desktop and make sure it’s running.
- **Visual Studio Code (VSCode):** Recommended for editing code. You may also install the **Supabase VSCode extension** for convenience (optional).
- **Blizzard API Credentials:** Create a Blizzard Developer account and register an application to obtain a **Client ID** and **Client Secret**. Enable the OAuth redirect URI for your app (you can add `http://localhost:54321/functions/v1/oauth-flow` for local testing via a tunnel, and the production URL for deployed testing).

## 1. Initializing the Supabase Project

First, create a new directory for the project and initialize Supabase:

1. **Create Project Folder:**  
   Open PowerShell and run:  

   ```powershell
   PS> cd f:\Projects\
   PS> mkdir guild-central-backend
   PS> cd guild-central-backend
   ```

   This creates and navigates into the project directory.

2. **Supabase Init:**  
   Inside the project folder, run the Supabase initialization:  

   ```powershell
   PS> supabase init
   ```  

   This will generate a `supabase/` directory with a basic configuration. It may create a `supabase/config.toml` (or `supabase/config.json`) file that includes your project reference (if you’re linked to a Supabase project) and default settings for the local database. It also sets up empty `supabase/migrations` and `supabase/functions` directories.

3. **Project Config:**  
   After `supabase init`, check the `supabase/config.toml` (or similar) file. Ensure the `project_id` (project reference) is set if you have one, and note the local database connection details (the CLI uses a Docker network with default ports, e.g., database running on `localhost:54322` internally with `postgres` user). Typically, you won’t need to manually edit this file for basic setup.

4. **VSCode Setup (Optional):**  
   Open the folder in VSCode:  

   ```powershell
   PS> code .
   ```  

   It’s recommended to create a workspace in VSCode and install the **Supabase** extension and a **PostgreSQL** syntax highlighting extension for editing SQL files.

## 2. Enabling Required Postgres Extensions

Our project requires three Postgres extensions: `uuid-ossp` (for UUID generation), `pg_cron` (for scheduling cron jobs), and `pgmq` (for message queues). We’ll add a migration to enable these extensions so that when the database starts, they are installed.

1. **Create a Migration for Extensions:**  
   Use the Supabase CLI to create a new migration file:  

   ```powershell
   PS> supabase migration new enable_extensions
   ```  

   This will create a timestamped SQL file in `supabase/migrations/`, e.g., `supabase/migrations/20250428121000_enable_extensions.sql`. Open this file in VSCode.

2. **Edit Migration File:**  
   In the new migration SQL file, add the following SQL commands to create the extensions:

   ```sql
   -- Enable required extensions
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   CREATE EXTENSION IF NOT EXISTS pgmq;
   ```

   Each `CREATE EXTENSION` will install the extension if it’s not already present. We use `IF NOT EXISTS` to avoid errors if they were enabled previously.

3. **Initial Schema (Optional):**  
   While we are in the migrations folder, we can also set up an initial schema for core tables (users, guilds, characters, etc.). You can either include this in the same `init` migration or create a separate migration. For clarity, let’s create a separate migration for the initial schema:

   ```powershell
   PS> supabase migration new init_schema
   ```  

   Then open the created file (e.g., `20250428121500_init_schema.sql`) and define basic tables:

   ```sql
   -- Users table: stores Battle.net identity and tokens
   CREATE TABLE public.users (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       battlenet_id BIGINT UNIQUE NOT NULL,
       battletag TEXT NOT NULL,
       access_token TEXT,       -- will store encrypted token
       refresh_token TEXT,      -- if using refresh tokens
       token_expires_at TIMESTAMP WITH TIME ZONE,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Guilds table: stores guild info
   CREATE TABLE public.guilds (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       name TEXT NOT NULL,
       realm_slug TEXT NOT NULL,
       region TEXT NOT NULL DEFAULT 'us',
       faction TEXT,            -- e.g., 'Alliance' or 'Horde', if needed
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       UNIQUE(name, realm_slug, region)  -- a guild is unique by name+realm+region
   );

   -- Characters table: stores WoW character info
   CREATE TABLE public.characters (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
       guild_id UUID REFERENCES public.guilds(id) ON DELETE SET NULL,
       name TEXT NOT NULL,
       realm_slug TEXT NOT NULL,
       region TEXT NOT NULL DEFAULT 'us',
       level INT,
       class_id INT,            -- references static class ID
       race_id INT,             -- references static race ID
       guild_rank INT,          -- rank index within the guild (0 = Guild Master, etc.)
       last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       UNIQUE(name, realm_slug, region)  -- unique character in a realm
   );
   ```

   These tables will serve as the foundation for storing user accounts (linked to Battle.net), guilds, and characters. We include foreign keys: each character links to a user (if that character’s owner is registered in our app) and to a guild. We’ll create the static data tables (classes, races, realms) in another migration later (covered in the Blizzard API Access doc).

   **Note:** We enabled the `uuid-ossp` extension specifically to use the `uuid_generate_v4()` function for UUID primary keys. We also anticipate storing tokens in the users table – in practice, **encrypt these tokens** before storing (for example, using PGCrypto’s `pgp_sym_encrypt` if a symmetric key is configured). For now, we just define columns; the secure storage detail is handled in code.

4. **Review Migrations:**  
   Ensure the migrations files are saved. The `supabase/migrations` folder might now look like:
   - `*_enable_extensions.sql` – enabling extensions.
   - `*_init_schema.sql` – creating initial tables.
   (If `supabase init` created a boilerplate migration, include the new SQL there or remove duplicates as needed.)

## 3. Starting the Supabase Local Dev Environment

With the configuration and migrations in place, it’s time to start the Supabase services (which will launch the Postgres database, a PostgREST API, authentication emulator, etc.) and apply our migrations.

1. **Start Supabase:**  
   Run the local development stack:  

   ```powershell
   PS> supabase start
   ```  

   The CLI will pull the necessary Docker images on first run (this may take a few minutes). It will then start containers for:
   - **Postgres** (with our extensions pre-installed if available).
   - **PostgREST** (RESTful API auto-generated for our tables, not heavily used in our case since we focus on custom functions).
   - **Authentication** (GoTrue, for email/password or third-party logins – we might use it for user sessions if needed).
   - **Storage** (file storage, not used in this project).
   - **Edge Runtime** (Deno server for Edge Functions).  

   When `supabase start` finishes, it will apply all SQL migrations in order. You should see logs indicating migration execution. If everything is successful, the database now has our tables and extensions. You can verify by connecting to the DB (using `supabase db remote connect` or any Postgres client) and running `SELECT * FROM pg_extension;` to see if `uuid_ossp`, `pg_cron`, and `pgmq` are listed.

2. **Troubleshooting:**  
   - If the containers fail to start or a migration fails, inspect the logs in the terminal. A common issue might be a syntax error in SQL. Fix any issues and you can re-run `supabase db reset` to wipe and reapply migrations or use `supabase db push` to attempt to apply changes.
   - Ensure Docker Desktop is running and that the ports (like 54321 for API, 54322 for DB) are not in use by other services.

3. **Supabase Studio:**  
   Once running, you can open Supabase Studio (usually at `http://localhost:54323` in your browser) to inspect the database, run SQL queries, and manage data visually. This is useful to verify that your tables (users, guilds, characters) exist.

## 4. Creating Basic Project Folders and Edge Functions

With the backend running, we will now scaffold the Edge Function directories and files that we know we’ll need.

1. **Edge Functions Directory:**  
   The `supabase/functions` directory is where all your Edge Function code lives. Within this folder, create subfolders for each function:
   - `oauth-flow` – will handle the OAuth redirect and token exchange.
   - `sync-static-data` – will fetch static game data (classes, races, realms).
   - `fetch-profile` – will fetch a user’s profile (characters and guild info).
   You can create these using the Supabase CLI or manually:

   ```powershell
   PS> supabase functions new oauth-flow --no-open
   PS> supabase functions new sync-static-data --no-open
   PS> supabase functions new fetch-profile --no-open
   ```  

   The `--no-open` flag prevents the CLI from opening your editor automatically. These commands will create the folders and a sample `index.ts` file in each with a basic template.

   *If the CLI method doesn’t work or you prefer manual:* simply create the folders and an empty `index.ts` in each. For example:  

   ```powershell
   PS> mkdir .\supabase\functions\oauth-flow\
   PS> ni .\supabase\functions\oauth-flow\index.ts -Type File
   ```  

   (Use `ni` as alias for `New-Item` in PowerShell to create a new file.)

2. **Install Dependencies (if any):**  
   Supabase Edge Functions run on Deno, so you typically include dependencies via URL imports in the code. For our purposes (HTTP requests, generating UUID/state, etc.), we might use standard libraries or minimal third-party libraries. We’ll specify those in the code later. You do not need a Node `package.json` for Edge Functions – they are not Node functions. The Supabase CLI will bundle the function code (it actually uses esbuild behind the scenes with Deno compatibility).

3. **Supabase Secrets Setup:**  
   To allow our Edge Functions to use the Blizzard API credentials and interact with our database, we need to configure environment variables/secrets:
   - **Local Development (.env):** In the `supabase/.env` file (which you may create), put the variables as shown in the `.env.example` from the overview. Specifically, add your `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` here so that when you serve functions locally, they can access these. Also include the `SUPABASE_SERVICE_ROLE_KEY` if you plan to use Supabase client in your functions.
   - **Supabase Cloud Secrets:** If you deploy this to a Supabase project online, you must upload the secrets. Use the CLI command:  

     ```powershell
     PS> supabase secrets set BLIZZARD_CLIENT_ID="your-client-id" BLIZZARD_CLIENT_SECRET="your-client-secret"
     ```  

     You should run this in your project directory (and ensure you’ve authenticated the CLI with `supabase login` and linked to the project with `supabase link` if needed). This stores the secrets in Supabase’s Vault, and they will be available to your Edge Functions at runtime via `Deno.env.get('BLIZZARD_CLIENT_ID')`, etc. (Likewise, Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function environment when deployed.)

4. **Verify Setup:**  
   At this point, your local environment is ready:
   - The database is running with required extensions and tables.
   - The functions directory is structured with placeholder files.
   - Your environment variables are set for development.
   You can test that an Edge Function can run by using the Supabase CLI to serve one function. For example:  

   ```powershell
   PS> supabase functions serve oauth-flow --env-file supabase/.env
   ```  

   This will compile and run the `oauth-flow` function locally at `http://localhost:54321/functions/v1/oauth-flow`. It likely just returns a default message (from the template code) since we haven’t implemented it yet. Press Ctrl+C to stop serving. (When using `supabase start`, the Edge Runtime will automatically serve any deployed functions, but during development we often serve one at a time for easier debugging.)

## 5. Next Steps

With the project skeleton in place, you can proceed to implement the core functionality:

- Follow the **[Blizzard OAuth Implementation](blizzard-auth-implementation.md)** guide to build out the `oauth-flow` function. This will enable user login via Blizzard and store user credentials in the database.
- Then, follow **[Blizzard API Data Access](blizzard-api-access.md)** to implement functions for syncing static data (classes, races, realms) and fetching profile data (characters and guild info). That guide will also instruct how to set up scheduled jobs via `pg_cron` and how to use `pgmq` if needed for background processing.

Throughout development, use `supabase migrate` commands to apply new SQL changes and `supabase functions deploy` to deploy updated Edge Functions to your local dev (or to the cloud project). Keep your `.env` updated with any new required secrets. By structuring the project as above, you maintain a clean separation of concerns and an easily deployable Supabase backend for your WoW Guild Management app.

---
