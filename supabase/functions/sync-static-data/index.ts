/// <reference types="https://deno.land/types/v1.31.1/deno.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Define types for dependencies
type FetchFn = typeof fetch;
type CreateClientFn = typeof createClient;

interface SyncEnv {
  clientId: string;
  clientSecret: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  apiRegion: string;
  locale: string;
}

interface SyncDependencies {
  fetch: FetchFn;
  createClient: CreateClientFn;
}

const BLIZZARD_TOKEN_URL = "https://oauth.battle.net/token";

// Extracted handler function for testability
export async function handleSyncStaticData(
  env: SyncEnv,
  deps: SyncDependencies
): Promise<Response> {
  const { clientId, clientSecret, supabaseUrl, serviceRoleKey, apiRegion, locale } = env;
  const { fetch, createClient } = deps;

  // Derive API constants from injected env vars
  const API_BASE_URL = `https://${apiRegion}.api.blizzard.com`;
  const NAMESPACE_STATIC = `static-${apiRegion}`;
  const NAMESPACE_DYNAMIC = `dynamic-${apiRegion}`;
  const LOCALE = locale;

  const sb: SupabaseClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Get client credentials token
    const tokenRes = await fetch(BLIZZARD_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${clientId}:${clientSecret}`),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials"
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Client token request failed:", tokenRes.status, errText);
      return new Response(`Failed to obtain client token: ${tokenRes.status}`, { status: 500 });
    }
    const tokenData = await tokenRes.json();
    const appAccessToken = tokenData.access_token;

    // 2. Fetch Playable Classes
    const classesUrl = `${API_BASE_URL}/data/wow/playable-class/index?namespace=${NAMESPACE_STATIC}&locale=${LOCALE}&access_token=${appAccessToken}`;
    const classesRes = await fetch(classesUrl);
    if (!classesRes.ok) {
      console.error("Failed to fetch classes:", classesRes.status, await classesRes.text());
      return new Response(`Failed to fetch classes data: ${classesRes.status}`, { status: 502 });
    }
    const classesData = await classesRes.json();
    const classesArray = classesData.classes || [];

    // Prepare class rows for upsert
    const classRows = classesArray.map((cls: any) => ({
      id: cls.id,
      name: cls.name?.[LOCALE] || cls.name || null // Use locale from env, fallback to generic name
    }));

    // 3. Fetch Playable Races
    const racesUrl = `${API_BASE_URL}/data/wow/playable-race/index?namespace=${NAMESPACE_STATIC}&locale=${LOCALE}&access_token=${appAccessToken}`;
    const racesRes = await fetch(racesUrl);
    if (!racesRes.ok) {
      console.error("Failed to fetch races:", racesRes.status, await racesRes.text());
      return new Response(`Failed to fetch races data: ${racesRes.status}`, { status: 502 });
    }
    const racesData = await racesRes.json();
    const racesArray = racesData.races || [];
    const raceRows = racesArray.map((race: any) => ({
      id: race.id,
      name: race.name?.[LOCALE] || race.name || null,
      faction: race.faction ? (race.faction.name?.[LOCALE] || race.faction.name) : null
    }));

    // 4. Fetch Realms
    const realmsUrl = `${API_BASE_URL}/data/wow/realm/index?namespace=${NAMESPACE_DYNAMIC}&locale=${LOCALE}&access_token=${appAccessToken}`;
    const realmsRes = await fetch(realmsUrl);
    if (!realmsRes.ok) {
      console.error("Failed to fetch realms:", realmsRes.status, await realmsRes.text());
      return new Response(`Failed to fetch realms data: ${realmsRes.status}`, { status: 502 });
    }
    const realmsData = await realmsRes.json();
    const realmsArray = realmsData.realms || [];
    const realmRows = realmsArray.map((realm: any) => ({
      id: realm.id,
      name: realm.name?.[LOCALE] || realm.name || null,
      slug: realm.slug,
      region: apiRegion // Use region from env
    }));

    // 5. Upsert into database using supabase client
    // Upsert classes
    let { error: classError } = await sb.from("wow_classes").upsert(classRows, { onConflict: "id" });
    if (classError) {
      throw new Error(`DB upsert error (classes): ${classError.message}`);
    }
    // Upsert races
    let { error: raceError } = await sb.from("wow_races").upsert(raceRows, { onConflict: "id" });
    if (raceError) {
      throw new Error(`DB upsert error (races): ${raceError.message}`);
    }
    // Upsert realms
    let { error: realmError } = await sb.from("wow_realms").upsert(realmRows, { onConflict: "id" });
    if (realmError) {
      throw new Error(`DB upsert error (realms): ${realmError.message}`);
    }

    const resultMsg = `Static data sync complete. Classes: ${classRows.length}, Races: ${raceRows.length}, Realms: ${realmRows.length} updated.`;
    console.log(resultMsg);
    return new Response(JSON.stringify({ message: resultMsg, classes: classRows.length, races: raceRows.length, realms: realmRows.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Error in sync-static-data:", err);
    return new Response(JSON.stringify({ error: "Internal error during static data sync.", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Main entry point for Deno Deploy
serve(async (_req: Request) => { // Request is not used by this function but serve requires it
  // Load environment variables
  const env: SyncEnv = {
    clientId: Deno.env.get("BLIZZARD_CLIENT_ID")!,
    clientSecret: Deno.env.get("BLIZZARD_CLIENT_SECRET")!,
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    apiRegion: Deno.env.get("BLIZZARD_API_REGION") || "us",
    locale: Deno.env.get("BLIZZARD_API_LOCALE") || "en_US",
  };

  // Prepare dependencies
  const deps: SyncDependencies = {
    fetch: fetch, // Use the global fetch
    createClient: createClient // Use the imported createClient
  };

  // Call the extracted handler
  return await handleSyncStaticData(env, deps);
});