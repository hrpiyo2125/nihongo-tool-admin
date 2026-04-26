import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type UserRow = {
  key: string;
  user_email: string | null;
  user_id: string | null;
  display_name: string | null;
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

  // user_idがある場合はauth.usersからemailを補完してemailで正規化
  const userMap = new Map<string, UserRow>();

  for (const s of sessions) {
    // メールもuser_idもないセッションはスキップ（古いBotのみセッション）
    if (!s.user_email && !s.user_id) continue;

    // 正規化キー: user_emailを優先（user_idのみの場合は後で補完）
    const key = s.user_email ?? s.user_id!;

    if (!userMap.has(key)) {
      userMap.set(key, {
        key,
        user_email: s.user_email,
        user_id: s.user_id,
        display_name: null,
        status: s.status,
        last_message: "",
        last_activity: s.created_at,
        latest_session_id: s.id,
        has_waiting: s.status === "waiting",
      });
    } else {
      const row = userMap.get(key)!;
      if (s.status === "waiting") row.has_waiting = true;
      // user_idがあれば補完
      if (s.user_id && !row.user_id) row.user_id = s.user_id;
      if (s.user_email && !row.user_email) row.user_email = s.user_email;
      // 最新セッション更新
      if (s.created_at > row.last_activity) {
        row.latest_session_id = s.id;
        row.status = s.status;
        row.last_activity = s.created_at;
      }
    }
  }

  const rows = Array.from(userMap.values());

  // user_idがあるユーザーのプロフィール（名前）を一括取得
  const userIds = rows.filter((r) => r.user_id).map((r) => r.user_id!);
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    if (profiles) {
      const profileMap = new Map(profiles.map((p) => [p.id, p.full_name]));
      for (const row of rows) {
        if (row.user_id && profileMap.has(row.user_id)) {
          row.display_name = profileMap.get(row.user_id) ?? null;
        }
      }
    }
  }

  // 最新メッセージを取得
  await Promise.all(rows.map(async (row) => {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("content")
      .eq("session_id", row.latest_session_id)
      .order("created_at", { ascending: false })
      .limit(1);
    row.last_message = msgs?.[0]?.content ?? "";
  }));

  // 対応待ちを最上位、あとは最新順
  rows.sort((a, b) => {
    if (a.has_waiting && !b.has_waiting) return -1;
    if (!a.has_waiting && b.has_waiting) return 1;
    return b.last_activity.localeCompare(a.last_activity);
  });

  return NextResponse.json(rows);
}
