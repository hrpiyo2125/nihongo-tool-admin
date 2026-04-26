"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

type Session = {
  id: string;
  created_at: string;
  status: string;
  user_email: string | null;
  topic: string | null;
  last_message?: string;
};

const STATUS_LABEL: Record<string, string> = { bot: "Bot", waiting: "⚡ 対応待ち", active: "💬 対応中", closed: "✅ 完了" };
const STATUS_COLOR: Record<string, string> = { bot: "#bbb", waiting: "#f43f5e", active: "#7a50b0", closed: "#22c55e" };

export default function ChatListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
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
    const { data } = await supabase.from("chat_sessions").select("id, created_at, status, user_email, topic").order("created_at", { ascending: false });
    if (!data) { setLoading(false); return; }
    const withMsgs = await Promise.all(data.map(async (s) => {
      const { data: msgs } = await supabase.from("chat_messages").select("content").eq("session_id", s.id).order("created_at", { ascending: false }).limit(1);
      return { ...s, last_message: msgs?.[0]?.content ?? "" };
    }));
    setSessions(withMsgs);
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
          {sessions.map((s) => (
            <Link key={s.id} href={`/chat/${s.id}`} style={{ textDecoration: "none" }}>
              <div style={{ background: "white", borderRadius: 16, padding: "14px 18px", boxShadow: "0 2px 10px rgba(155,110,212,0.07)", border: s.status === "waiting" ? "1.5px solid #f43f5e" : "1.5px solid transparent", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[s.status] ?? "#bbb" }}>{STATUS_LABEL[s.status] ?? s.status}</span>
                  <span style={{ fontSize: 11, color: "#ccc" }}>{fmt(s.created_at)}</span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#555", margin: "0 0 2px" }}>{s.user_email ?? "メール未取得"}</p>
                <p style={{ fontSize: 12, color: "#aaa", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.last_message || "メッセージなし"}</p>
              </div>
            </Link>
          ))}
          {!loading && sessions.length === 0 && <p style={{ textAlign: "center", color: "#bbb", fontSize: 13 }}>チャットはまだありません</p>}
        </div>
      </div>
    </div>
  );
}
