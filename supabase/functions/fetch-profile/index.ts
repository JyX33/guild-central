import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Blizzard API base (assuming US for profile; profile calls require region too in path or host)
const API_BASE_URL_US = "https://us.api.blizzard.com";
const NAMESPACE_PROFILE = "profile-us";
const LOCALE = Deno.env.get("BLIZZARD_API_LOCALE") || "en_US";
const BLIZZARD_API_REGION = Deno.env.get("BLIZZARD_API_REGION") || "us"; // Use environment variable for region

serve(async (req: Request) => {
  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("user_id");
  const battlenetIdParam = url.searchParams.get("battlenet_id");

  if (!userIdParam && !battlenetIdParam) {
    return new Response("Missing user identifier (user_id or battlenet_id)", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Get user record and token
    let userFilter;
    if (userIdParam) {
      userFilter = { id: userIdParam };
    } else {
      userFilter = { battlenet_id: Number(battlenetIdParam) };
    }
    const { data: userData, error: userError } = await sb.from("users").select("*").match(userFilter).single();
    if (userError || !userData) {
      return new Response("User not found in database.", { status: 404 });
    }
    const accessToken = userData.access_token;
    // Optional: if token expired, you might want to refresh here with refresh_token.
    // For now, assume token is valid if present.

    // 2. Fetch account profile summary
    const accountProfileRes = await fetch(`https://${BLIZZARD_API_REGION}.api.blizzard.com/profile/user/wow?namespace=profile-${BLIZZARD_API_REGION}&locale=${LOCALE}`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    if (!accountProfileRes.ok) {
      console.error("Account profile fetch failed:", accountProfileRes.status);
      if (accountProfileRes.status === 401) {
        return new Response("Access token expired or invalid.", { status: 401 });
      }
      return new Response("Failed to fetch account profile.", { status: 500 });
    }
    const accountProfile = await accountProfileRes.json();
    // The structure has wow_accounts array
    const wowAccounts = accountProfile.wow_accounts || [];
    let allCharacters: any[] = [];
    for (const wowAccount of wowAccounts) {
      if (wowAccount.characters) {
        allCharacters = allCharacters.concat(wowAccount.characters);
      }
    }
    // allCharacters now is a list of character summaries { name, id, realm{slug}, playable_class{id}, playable_race{id}, level, etc. }
    // We'll upsert each character and possibly their guild.

    // Prepare arrays for DB upserts
    const charRows: any[] = [];
    const guildRows: any[] = [];

    for (const char of allCharacters) {
      const name: string = char.name;
      const realmSlug: string = char.realm.slug;
      const classId: number = char.playable_class.id;
      const raceId: number = char.playable_race.id;
      const level: number = char.level;
      const region: string = BLIZZARD_API_REGION; // Use the configured region

      // Call character profile to get guild if any
      const charProfileRes = await fetch(`https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${name.toLowerCase()}?namespace=profile-${region}&locale=${LOCALE}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (charProfileRes.ok) {
        const charProfile = await charProfileRes.json();
        if (charProfile.guild) {
          const guildName: string = charProfile.guild.name;
          const guildRealmSlug: string = charProfile.guild.realm.slug;
          const guildRegion: string = region; // implied by namespace used
          // Upsert guild (if not exists)
          guildRows.push({
            name: guildName,
            realm_slug: guildRealmSlug,
            region: guildRegion
          });
        }
      } else {
        console.warn(`Could not fetch profile for character ${name}-${realmSlug}: status ${charProfileRes.status}`);
      }

      charRows.push({
        name: name,
        realm_slug: realmSlug,
        region: region,
        user_id: userData.id,
        level: level,
        class_id: classId,
        race_id: raceId
        // guild_id we'll fill in after guild upsert
        // guild_rank left null (could fill if we had it)
      });
    }

    // Upsert guilds first and create a map of guild composite to id
    let guildIdMap: { [key: string]: string } = {};
    if (guildRows.length > 0) {
      // Remove duplicates from guildRows
      const uniqueGuilds: { [key: string]: any } = {};
      for (const g of guildRows) {
        const key = `${g.name}|${g.realm_slug}|${g.region}`;
        uniqueGuilds[key] = g;
      }
      const guildsToUpsert = Object.values(uniqueGuilds);
      const { data: upsertedGuilds, error: guildError } = await sb.from("guilds").upsert(guildsToUpsert as any[], { onConflict: "name, realm_slug, region" }).select("id, name, realm_slug, region"); // Select to get IDs
      if (guildError) {
        throw new Error(`Guild upsert failed: ${guildError.message}`);
      }
      if (upsertedGuilds) {
        for (const g of upsertedGuilds) {
          guildIdMap[`${g.name}|${g.realm_slug}|${g.region}`] = g.id;
        }
      }
    }

    // Now link guild_id in charRows
    for (const c of charRows) {
      // Find the corresponding guild in guildRows to get its name, realm_slug, region
      const characterGuild = guildRows.find(g =>
        // This assumes the order of characters and guilds is the same, which is not guaranteed.
        // A better approach is to find the guild in the uniqueGuilds object by character name, realm, region.
        // However, the character object itself doesn't directly contain guild name/realm after the initial fetch.
        // We need to rely on the charProfileRes which was processed inside the loop.
        // Let's find the guild in the original allCharacters array and then look up its ID in the map.
        allCharacters.find(ac => ac.name === c.name && ac.realm.slug === c.realm_slug && ac.guild?.name === g.name && ac.guild?.realm.slug === g.realm_slug)
      );

      if (characterGuild) {
         const guildKey = `${characterGuild.guild.name}|${characterGuild.guild.realm.slug}|${c.region}`;
         if (guildIdMap[guildKey]) {
           c.guild_id = guildIdMap[guildKey];
         } else {
           c.guild_id = null; // Should not happen if upsert was successful
         }
      } else {
        c.guild_id = null; // Character is guildless
      }
    }

    // Upsert characters
    const { error: charError } = await sb.from("characters").upsert(charRows, { onConflict: "name, realm_slug, region" });
    if (charError) {
      throw new Error(`Character upsert failed: ${charError.message}`);
    }

    // (Optional) Remove characters that are in DB for this user but not in allCharacters list:
    // We can get all names from allCharacters and delete others for this user.
    const currentCharKeys = new Set(allCharacters.map(c => `${c.name}|${c.realm.slug}|${BLIZZARD_API_REGION}`));
    const { data: existingChars } = await sb.from("characters")
      .select("name, realm_slug, region")
      .eq("user_id", userData.id);
    if (existingChars) {
      for (const char of existingChars) {
        const key = `${char.name}|${char.realm_slug}|${char.region}`;
        if (!currentCharKeys.has(key)) {
          // delete this char
          await sb.from("characters").delete().match({ user_id: userData.id, name: char.name, realm_slug: char.realm_slug, region: char.region });
        }
      }
    }

    return new Response(`Profile sync completed for user ${userData.battletag}. Characters updated: ${charRows.length}`, { status: 200 });
  } catch (err) {
    console.error("Error in fetch-profile:", err);
    return new Response("Failed to sync profile data.", { status: 500 });
  }
});