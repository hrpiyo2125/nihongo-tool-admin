import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "toolio <noreply@nihongo-tool.com>";
const BASE_URL = "https://nihongo-tool.com";

export async function POST(req: NextRequest) {
  const { sessionId, message } = await req.json();

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("user_email, status")
    .eq("id", sessionId)
    .single();

  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "staff",
    content: message,
  });

  await supabase
    .from("chat_sessions")
    .update({ status: "active" })
    .eq("id", sessionId);

  if (session.user_email) {
    const chatUrl = `${BASE_URL}/ja/chat/${sessionId}`;
    await resend.emails.send({
      from: FROM,
      to: session.user_email,
      subject: "【toolio】担当者からメッセージが届きました",
      html: `
        <p>toolioサポートより返信が届きました。</p>
        <p>以下のリンクからチャットを再開できます。</p>
        <a href="${chatUrl}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:linear-gradient(135deg,#f4b9b9,#e49bfd);color:white;border-radius:20px;text-decoration:none;font-weight:700;">チャットを確認する</a>
        <br /><br />
        <p style="color:#aaa;font-size:12px;">toolio | nihongo-tool.com</p>
      `,
    });
  }

  return NextResponse.json({ ok: true });
}
