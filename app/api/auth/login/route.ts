import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    // Vérification obligatoire des variables d'environnement
    const appPassword = process.env.APP_PASSWORD;
    const appSecret = process.env.APP_SECRET;

    if (!appPassword || !appSecret) {
      return NextResponse.json({
        ok: false,
        error: "Configuration serveur incorrecte"
      }, { status: 500 });
    }

    const body = await request.json();

    if (body.action === "logout") {
      const c = await cookies();
      c.delete("nudgebot-session");
      return NextResponse.json({ ok: true });
    }

    if (body.password === appPassword) {
      const c = await cookies();
      c.set("nudgebot-session", appSecret, {
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
