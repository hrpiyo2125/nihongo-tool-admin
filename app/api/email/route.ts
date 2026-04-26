import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "toolio <noreply@nihongo-tool.com>";

export async function POST(req: NextRequest) {
  const { to, subject, body, sessionId } = await req.json();
  if (!to || !subject || !body) {
    return NextResponse.json({ error: "to, subject, body are required" }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: `
      <div style="font-family:'Hiragino Sans',sans-serif;max-width:600px;margin:0 auto;">
        <p style="white-space:pre-wrap;">${body.replace(/\n/g, "<br>")}</p>
        <br>
        <p style="color:#aaa;font-size:12px;">toolio | nihongo-tool.com</p>
      </div>
    `,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // メール送信履歴を記録
  await supabase.from("email_logs").insert({
    to_email: to,
    subject,
    body,
    session_id: sessionId ?? null,
    sent_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}

// 送信履歴を取得
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const { data } = await supabase
    .from("email_logs")
    .select("id, subject, body, sent_at, session_id")
    .eq("to_email", email)
    .order("sent_at", { ascending: false })
    .limit(20);

  return NextResponse.json(data ?? []);
}
