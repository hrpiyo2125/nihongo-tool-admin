import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// セッション情報 + そのユーザーの全メッセージを返す
export async function GET(_req: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;

  // まずそのセッションを取得
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, user_email, user_id, status, memo, created_at")
    .eq("id", sessionId)
    .single();

  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  // user_idがあれば同一ユーザーの全セッションを取得、なければこのセッションのみ
  let allSessionIds: string[] = [sessionId];
  let allSessions: { id: string; created_at: string; status: string }[] = [];

  if (session.user_id) {
    const { data: userSessions } = await supabase
      .from("chat_sessions")
      .select("id, created_at, status")
      .eq("user_id", session.user_id)
      .order("created_at", { ascending: true });

    if (userSessions && userSessions.length > 0) {
      allSessionIds = userSessions.map((s) => s.id);
      allSessions = userSessions;
    }
  } else if (session.user_email) {
    const { data: userSessions } = await supabase
      .from("chat_sessions")
      .select("id, created_at, status")
      .eq("user_email", session.user_email)
      .order("created_at", { ascending: true });

    if (userSessions && userSessions.length > 0) {
      allSessionIds = userSessions.map((s) => s.id);
      allSessions = userSessions;
    }
  }

  // 全セッションのメッセージを一括取得
  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, session_id, role, content, created_at")
    .in("session_id", allSessionIds)
    .order("created_at", { ascending: true });

  // ユーザー名をprofilesから取得
  let display_name: string | null = null;
  if (session.user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user_id)
      .single();
    display_name = profile?.full_name ?? null;
  }

  return NextResponse.json({
    session: { ...session, display_name },
    allSessions,
    messages: messages ?? [],
  });
}
