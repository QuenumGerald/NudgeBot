import { NextResponse } from "next/server";
import { getSettings, setSetting } from "@/lib/db";

// Keys that should be masked (show as "••••••" in the UI if set)
const SENSITIVE_KEYS = [
  "llm_api_key",
  "github_token",
  "jira_api_token",
  "google_client_secret",
  "google_refresh_token",
];

export async function GET() {
  try {
    const settings = await getSettings();
    // Mask sensitive values so they're not sent to the browser
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      masked[key] = SENSITIVE_KEYS.includes(key) && value ? "••••••" : value;
    }
    return NextResponse.json({ settings: masked });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Batch upsert: { keys: { key: value, ... } }
    if (body.keys && typeof body.keys === "object") {
      for (const [key, value] of Object.entries(body.keys)) {
        // Skip if value is the mask placeholder (user didn't change it)
        if (value === "••••••") continue;
        await setSetting(key, String(value));
      }
      return NextResponse.json({ ok: true });
    }

    // Single upsert: { key, value }
    if (body.key && body.value !== undefined) {
      if (body.value === "••••••") return NextResponse.json({ ok: true });
      await setSetting(body.key, String(body.value));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
