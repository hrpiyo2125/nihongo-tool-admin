import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { sessionId, typing } = await req.json();
  await supabase
    .from("chat_sessions")
    .update({ staff_typing_at: typing ? new Date().toISOString() : null })
    .eq("id", sessionId);
  return NextResponse.json({ ok: true });
}
