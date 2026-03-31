import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "logout") {
      const c = await cookies();
      c.delete("nudgebot-session");
      return NextResponse.json({ ok: true });
    }

    if (body.password === config.appPassword) {
      const c = await cookies();
      c.set("nudgebot-session", config.appSecret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60,
      });
      return NextResponse.json({ ok: true });
    }

    // Anti-brute-force delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    return NextResponse.json({ ok: false, error: "Mot de passe incorrect" }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 });
  }
}
