import { NextResponse } from "next/server";
import { getStats, getSessions, getMemories, saveMemory, deleteMemory, deleteSession } from "@/lib/memory";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "stats") {
      const stats = await getStats();
      return NextResponse.json(stats);
    }

    if (type === "sessions") {
      const sessions = await getSessions();
      return NextResponse.json(sessions);
    }

    const memories = await getMemories(50);
    return NextResponse.json(memories);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch memory data" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { content, category, importance } = await request.json();
    await saveMemory(content, category, importance);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save memory" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const sessionId = searchParams.get("sessionId");

    if (id) {
      await deleteMemory(parseInt(id, 10));
    } else if (sessionId) {
      await deleteSession(sessionId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
