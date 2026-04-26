import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();

  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "staff",
    content: "ご利用ありがとうございました。またいつでもお気軽にご相談ください。",
  });

  await supabase.from("chat_sessions").update({ status: "done" }).eq("id", sessionId);

  return NextResponse.json({ ok: true });
}
