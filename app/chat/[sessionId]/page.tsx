"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

type Message = { id: string; role: string; content: string; created_at: string };

const ROLE_LABEL: Record<string, string> = { bot: "Bot", user: "ユーザー", staff: "あなた" };

export default function AdminChatDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<{ user_email: string | null; status: string } | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") !== "ok") { router.replace("/"); return; }
    load();
    const channel = supabase.channel(`admin:${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function load() {
    const [{ data: sess }, { data: msgs }] = await Promise.all([
      supabase.from("chat_sessions").select("user_email, status").eq("id", sessionId).single(),
      supabase.from("chat_messages").select("*").eq("session_id", sessionId).order("created_at"),
    ]);
    if (sess) setSession(sess);
    if (msgs) setMessages(msgs);
  }

  async function handleSend() {
    const content = reply.trim();
    if (!content || sending) return;
    setReply("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setSending(true);
    await fetch(`/api/staff-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: content }),
    });
    setSending(false);
    const { data } = await supabase.from("chat_sessions").select("user_email, status").eq("id", sessionId).single();
    if (data) setSession(data);
  }

  const STATUS_LABEL: Record<string, string> = { bot: "Bot対応中", waiting: "⚡ 対応待ち", active: "💬 対応中", closed: "✅ 完了" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", maxWidth: 680, margin: "0 auto", padding: "0 0 0" }}>

      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg,#f4b9b9,#e49bfd,#a3c0ff)", padding: "14px 20px", color: "white", flexShrink: 0 }}>
        <Link href="/chat" style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "block", marginBottom: 6 }}>← 一覧に戻る</Link>
        <p style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>{session?.user_email ?? "読み込み中..."}</p>
        {session && <p style={{ fontSize: 11, margin: "2px 0 0", opacity: 0.85 }}>{STATUS_LABEL[session.status] ?? session.status}</p>}
      </div>

      {/* メッセージ */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px", display: "flex", flexDirection: "column", gap: 10, background: "#f8f4f4" }}>
        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <span style={{ fontSize: 10, color: "#bbb", marginBottom: 2 }}>{ROLE_LABEL[m.role] ?? m.role}</span>
            <div style={{
              maxWidth: "78%", padding: "9px 13px",
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: m.role === "user" ? "linear-gradient(135deg,#f4b9b9,#e49bfd)" : m.role === "staff" ? "#e8f4ff" : "white",
              color: m.role === "user" ? "white" : "#333",
              fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {messages.length === 0 && <p style={{ textAlign: "center", color: "#ccc", fontSize: 13, marginTop: 40 }}>メッセージはまだありません</p>}
        <div ref={bottomRef} />
      </div>

      {/* 入力バー */}
      <div style={{ padding: "10px 12px", borderTop: "0.5px solid rgba(200,170,240,0.2)", display: "flex", gap: 8, alignItems: "flex-end", background: "white", flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="返信を入力... (Enterで送信、Shift+Enterで改行)"
          value={reply}
          onChange={(e) => { setReply(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          style={{ flex: 1, padding: "9px 13px", borderRadius: 20, border: "1px solid rgba(200,170,240,0.5)", fontSize: 13, resize: "none", outline: "none", lineHeight: 1.5, overflow: "hidden", maxHeight: 120 }}
        />
        <button
          onClick={handleSend}
          disabled={!reply.trim() || sending}
          style={{ padding: "9px 18px", borderRadius: 20, border: "none", background: reply.trim() ? "linear-gradient(135deg,#f4b9b9,#e49bfd)" : "#e5e5e5", color: reply.trim() ? "white" : "#bbb", cursor: reply.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 700, flexShrink: 0 }}
        >
          {sending ? "送信中" : "送信"}
        </button>
      </div>
    </div>
  );
}
