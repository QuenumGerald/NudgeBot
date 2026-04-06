import { NextResponse } from "next/server";

// Keys that should be masked (show as "••••••" in the UI if set)
const SENSITIVE_KEYS = [
  "llm_api_key",
  "github_token",
  "jira_api_token",
  "google_client_secret",
  "google_refresh_token",
];

async function loadDb() {
  try {
    return await import("@/lib/db");
  } catch (error: any) {
    console.error("[API/settings] Failed to load DB module:", error);
    return null;
  }
}

export async function GET() {
  try {
    console.log("[API/settings] GET called");
    const db = await loadDb();
    if (!db) {
      return NextResponse.json(
        { error: "Database module unavailable. Restart server and rebuild dependencies." },
        { status: 500 }
      );
    }
    await db.initDb();
    console.log("[API/settings] DB initialized");
    const settings = await db.getSettings();
    console.log("[API/settings] Settings loaded, keys:", Object.keys(settings));
    // Mask sensitive values so they're not sent to the browser
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      masked[key] = SENSITIVE_KEYS.includes(key) && value ? "••••••" : value;
    }
    return NextResponse.json({ settings: masked });
  } catch (error: any) {
    console.error("[API/settings] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    console.log("[API/settings] POST called");
    const db = await loadDb();
    if (!db) {
      return NextResponse.json(
        { error: "Database module unavailable. Restart server and rebuild dependencies." },
        { status: 500 }
      );
    }
    await db.initDb();
    console.log("[API/settings] DB initialized for POST");
    const body = await request.json();
    console.log(`[API/settings] POST body:`, body);

    // Batch upsert: { keys: { key: value, ... } }
    if (body.keys && typeof body.keys === "object") {
      for (const [key, value] of Object.entries(body.keys)) {
        // Skip if value is the mask placeholder (user didn't change it)
        if (value === "••••••") {
          console.log(`[API/settings] Skipping masked value for ${key}`);
          continue;
        }
        console.log(`[API/settings] Saving ${key} (length: ${String(value).length})`);
        await db.setSetting(key, String(value));
      }
      return NextResponse.json({ ok: true });
    }

    // Single upsert: { key, value }
    if (body.key && body.value !== undefined) {
      if (body.value === "••••••") return NextResponse.json({ ok: true });
      console.log(`[API/settings] Saving single ${body.key}`);
      await db.setSetting(body.key, String(body.value));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  } catch (error: any) {
    console.error(`[API/settings] Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
