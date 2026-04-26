import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type UserRow = {
  key: string; // user_id or user_email
  user_email: string | null;
  user_id: string | null;
  status: string;
  last_message: string;
  last_activity: string;
  latest_session_id: string;
  has_waiting: boolean;
};

export async function GET() {
  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("id, created_at, status, user_email, user_id")
    .order("created_at", { ascending: false });

  if (!sessions) return NextResponse.json([]);

  // ユーザーごとにグループ化（user_id優先、なければuser_email）
  const userMap = new Map<string, UserRow>();

  for (const s of sessions) {
    const key = s.user_id ?? s.user_email ?? s.id;
    if (!userMap.has(key)) {
      userMap.set(key, {
        key,
        user_email: s.user_email,
        user_id: s.user_id,
        status: s.status,
        last_message: "",
        last_activity: s.created_at,
        latest_session_id: s.id,
        has_waiting: s.status === "waiting",
      });
    } else {
      const row = userMap.get(key)!;
      if (s.status === "waiting") row.has_waiting = true;
      // 最新セッションのステータスを使う
      if (s.created_at > row.last_activity) {
        row.latest_session_id = s.id;
        row.status = s.status;
        row.last_activity = s.created_at;
      }
    }
  }

  // 各ユーザーの最新メッセージを取得
  const rows = Array.from(userMap.values());
  await Promise.all(rows.map(async (row) => {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("content")
      .eq("session_id", row.latest_session_id)
      .order("created_at", { ascending: false })
      .limit(1);
    row.last_message = msgs?.[0]?.content ?? "";
  }));

  // has_waitingを優先してソート
  rows.sort((a, b) => {
    if (a.has_waiting && !b.has_waiting) return -1;
    if (!a.has_waiting && b.has_waiting) return 1;
    return b.last_activity.localeCompare(a.last_activity);
  });

  return NextResponse.json(rows);
}
