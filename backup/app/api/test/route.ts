import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", message: "Test endpoint works" });
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ 
    status: "ok", 
    received: body,
    timestamp: new Date().toISOString()
  });
}
