/// <reference types="https://deno.land/std@0.168.0/http/server.ts" />
/// <reference types="https://esm.sh/@supabase/supabase-js@2" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BLIZZARD_AUTH_URL = "https://oauth.battle.net/authorize";
const BLIZZARD_TOKEN_URL = "https://oauth.battle.net/token";

// Scopes for WoW profile access (openid gives BattleTag & ID, wow.profile gives game profile)
const OAUTH_SCOPES = "openid wow.profile";

// Helper to generate a random string for state (16 characters alphanumeric)
function generateState(length = 16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // Load our config from environment
  const clientId = Deno.env.get("BLIZZARD_CLIENT_ID")!;
  const clientSecret = Deno.env.get("BLIZZARD_CLIENT_SECRET")!;
  const redirectUri = Deno.env.get("BLIZZARD_OAUTH_REDIRECT_URI")!;
  
  try {
    if (errorParam) {
      console.error("Authentication error from Blizzard:", errorParam);
      return new Response(`Authentication error: ${errorParam}`, { status: 400 });
    }

    if (!code) {
      // Step 1: No code present, initiate auth request by redirecting to Blizzard
      const stateVal = generateState();
      // Set cookie for state (HTTP-only, short-lived)
      const headers = new Headers();
      headers.set("Set-Cookie", `oauth_state=${stateVal}; HttpOnly; Path=/; Max-Age=300`); // expires in 5 minutes
      const authUrl = `${BLIZZARD_AUTH_URL}?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(OAUTH_SCOPES)}&state=${stateVal}`;
      headers.set("Location", authUrl);
      return new Response("Redirecting to Blizzard for authentication...", {
        status: 302,
        headers: headers
      });
    }

    // Step 2: We have been redirected back with a code (and possibly state)
    // Check state for CSRF protection
    const cookies = Object.fromEntries(
      req.headers.get("Cookie")?.split(";").map(c => {
        const [name, ...rest] = c.trim().split("=");
        return [name, rest.join("=")];
      }) || []
    );
    const storedState = cookies["oauth_state"];
    if (!state || !storedState || state !== storedState) {
      console.error("State mismatch or missing. Potential CSRF attack.");
      return new Response("Invalid state parameter. Authentication aborted.", { status: 400 });
    }

    // Exchange the authorization code for tokens
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch(BLIZZARD_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Token exchange failed:", tokenResponse.status, errorBody);
      return new Response("Failed to exchange authorization code for token.", { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken: string = tokenData.access_token;
    const refreshToken: string | undefined = tokenData.refresh_token;
    const expiresIn: number = tokenData.expires_in;
    // token_type is usually "bearer"

    // Step 3: Fetch user info (BattleTag and ID)
    const userInfoResp = await fetch("https://oauth.battle.net/oauth/userinfo", {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });
    if (!userInfoResp.ok) {
      console.error("Failed to fetch user info:", userInfoResp.status);
      return new Response("Failed to retrieve user information.", { status: 500 });
    }
    const userInfo = await userInfoResp.json();
    const battleTag: string = userInfo.battletag;
    const battleNetId: number = userInfo.id;  // numeric ID

    // Step 4: Store/Update user in the database
    // We'll use Supabase client to upsert the user. The service role key must be available.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);  // using supabase-js client
    // Upsert the user (if battlenet_id exists, update; otherwise insert)
    const { error } = await adminClient.from("users").upsert({
      battlenet_id: battleNetId,
      battletag: battleTag,
      access_token: accessToken,       // In production, encrypt this before storing
      refresh_token: refreshToken || null,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
    }, { onConflict: "battlenet_id" });
    if (error) {
      console.error("DB upsert error:", error.message);
      return new Response("Database error while saving user data.", { status: 500 });
    }

    // Step 5: Finish - respond to the client
    // At this point, the user is authenticated. We might want to create a session.
    // For simplicity, we'll just return a message or HTML that the login succeeded.
    const responseHtml = `<html><body><script>
      // Notify parent window or application of success
      window.close();
      </script>
      <p>Login successful! You can close this window.</p></body></html>`;
    return new Response(responseHtml, {
      headers: { "Content-Type": "text/html" }
    });
  } catch (err) {
    console.error("Unexpected error in OAuth flow:", err);
    return new Response("Internal Server Error during OAuth process.", { status: 500 });
  }
});