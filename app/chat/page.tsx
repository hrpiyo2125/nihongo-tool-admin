"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

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

const STATUS_LABEL: Record<string, string> = { bot: "Bot", waiting: "⚡ 対応待ち", active: "💬 対応中", done: "✅ 完了" };
const STATUS_COLOR: Record<string, string> = { bot: "#bbb", waiting: "#f43f5e", active: "#7a50b0", done: "#22c55e" };

export default function ChatListPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") !== "ok") { router.replace("/"); return; }
    load();
    const channel = supabase.channel("admin:sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_sessions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function load() {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  function fmt(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <div style={{ minHeight: "100vh", padding: "28px 16px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: 3, color: "rgba(180,120,210,0.6)", textTransform: "uppercase", margin: "0 0 4px" }}>Admin</p>
            <h1 style={{ fontSize: 20, fontWeight: 800, background: "linear-gradient(135deg,#f4b9b9,#e49bfd,#a3c0ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>チャット管理</h1>
          </div>
          <button onClick={() => { sessionStorage.removeItem("admin_auth"); router.replace("/"); }} style={{ fontSize: 12, color: "#bbb", background: "none", border: "none", cursor: "pointer" }}>ログアウト</button>
        </div>

        {loading && <p style={{ color: "#bbb", textAlign: "center" }}>読み込み中...</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {users.map((u) => (
            <Link key={u.key} href={`/chat/${u.latest_session_id}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: "white", borderRadius: 16, padding: "14px 18px",
                boxShadow: "0 2px 10px rgba(155,110,212,0.07)",
                border: u.has_waiting ? "1.5px solid #f43f5e" : "1.5px solid transparent",
                cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[u.status] ?? "#bbb" }}>
                    {u.has_waiting ? "⚡ 対応待ち" : STATUS_LABEL[u.status] ?? u.status}
                  </span>
                  <span style={{ fontSize: 11, color: "#ccc" }}>{fmt(u.last_activity)}</span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#555", margin: "0 0 2px" }}>
                  {u.display_name ?? u.user_email ?? "不明なユーザー"}
                </p>
                {u.display_name && u.user_email && (
                  <p style={{ fontSize: 11, color: "#bbb", margin: "0 0 2px" }}>{u.user_email}</p>
                )}
                <p style={{ fontSize: 12, color: "#aaa", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {u.last_message || "メッセージなし"}
                </p>
              </div>
            </Link>
          ))}
          {!loading && users.length === 0 && <p style={{ textAlign: "center", color: "#bbb", fontSize: 13 }}>チャットはまだありません</p>}
        </div>
      </div>
    </div>
  );
}
