"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

type Message = { id: string; session_id: string; role: string; content: string; created_at: string };
type Session = { user_email: string | null; user_id: string | null; status: string; memo?: string | null; display_name?: string | null };
type SessionMeta = { id: string; created_at: string; status: string };

type CustomerInfo = {
  email: string;
  registeredAt: string | null;
  lastSignIn: string | null;
  profile: {
    plan: string;
    plan_status: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
    payment_failed_at: string | null;
    status: string | null;
    trial_end: string | null;
  } | null;
  purchases: { material_id: string; created_at: string }[];
  recentDownloads: { material_id: string; created_at: string }[];
  downloadCount: number;
  pastChats: { id: string; created_at: string; status: string }[];
  chatCount: number;
};

type EmailLog = { id: string; subject: string; body: string; sent_at: string; session_id: string | null };

const ROLE_LABEL: Record<string, string> = { bot: "Bot", user: "ユーザー", staff: "あなた" };
const STATUS_LABEL: Record<string, string> = { bot: "Bot対応中", waiting: "⚡ 対応待ち", active: "💬 対応中", done: "✅ 完了", closed: "✅ 完了" };
const PLAN_LABEL: Record<string, string> = { free: "無料", light: "ライト", standard: "スタンダード", premium: "プレミアム" };
const PLAN_COLOR: Record<string, string> = { free: "#bbb", light: "#60a5fa", standard: "#a78bfa", premium: "#f59e0b" };

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtFull(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AdminChatDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [allSessions, setAllSessions] = useState<SessionMeta[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"info" | "email" | "memo">("info");
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);

  const [memo, setMemo] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoSaved, setMemoSaved] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function markAsRead() {
    await supabase.from("chat_sessions").update({ staff_last_read_at: new Date().toISOString() }).eq("id", sessionId);
  }

  function handleTyping() {
    supabase.from("chat_sessions").update({ staff_typing_at: new Date().toISOString() }).eq("id", sessionId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      supabase.from("chat_sessions").update({ staff_typing_at: null }).eq("id", sessionId);
    }, 4000);
  }

  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") !== "ok") { router.replace("/"); return; }
    load();
    markAsRead();
    const channel = supabase.channel(`admin:${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
        markAsRead();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [sessionId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function load() {
    const res = await fetch(`/api/session/${sessionId}`);
    const data = await res.json();
    if (data.error) return;

    setSession(data.session);
    setMemo(data.session.memo ?? "");
    setAllSessions(data.allSessions ?? []);
    setMessages(data.messages ?? []);

    if (data.session.user_id) loadCustomer(undefined, data.session.user_id);
    else if (data.session.user_email) loadCustomer(data.session.user_email);
  }

  const loadCustomer = useCallback(async (email?: string, userId?: string) => {
    setCustomerLoading(true);
    const params = userId
      ? `userId=${encodeURIComponent(userId)}`
      : `email=${encodeURIComponent(email ?? "")}`;
    const res = await fetch(`/api/customer?${params}`);
    const data = await res.json();
    setCustomer(data);
    setCustomerLoading(false);
  }, []);

  const loadEmailLogs = useCallback(async (email: string | null | undefined) => {
    if (!email) return;
    setEmailLoading(true);
    const res = await fetch(`/api/email?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    setEmailLogs(Array.isArray(data) ? data : []);
    setEmailLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "email" && session?.user_email) {
      loadEmailLogs(session.user_email);
    }
  }, [activeTab, session?.user_email]);

  async function handleNotify() {
    if (!confirm(`${session?.user_email} にチャット開始メールを送信しますか？`)) return;
    setNotifying(true);
    try {
      await fetch("/api/notify-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      alert("メールを送信しました。");
    } catch {
      alert("送信に失敗しました。再度お試しください。");
    } finally {
      setNotifying(false);
    }
  }

  async function handleComplete() {
    if (!confirm("対応を完了しますか？ユーザーにお礼メッセージが送信されます。")) return;
    setSending(true);
    try {
      await fetch("/api/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      setSession((s) => s ? { ...s, status: "done" } : s);
    } catch {
      alert("完了処理に失敗しました。再度お試しください。");
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    const content = reply.trim();
    if (!content || sending) return;
    flushSync(() => setReply(""));
    if (inputRef.current) { inputRef.current.value = ""; inputRef.current.style.height = "auto"; }
    setSending(true);
    try {
      const res = await fetch("/api/staff-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, message: content }) });
      if (!res.ok) throw new Error("staff-reply failed");
      const sessionRes = await fetch(`/api/session/${sessionId}`);
      const data = await sessionRes.json();
      if (data.session) setSession(data.session);
    } catch {
      alert("送信に失敗しました。再度お試しください。");
      setReply(content);
      if (inputRef.current) inputRef.current.value = content;
    } finally {
      setSending(false);
    }
  }

  async function handleSaveMemo() {
    setMemoSaving(true);
    await fetch("/api/memo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, memo }) });
    setMemoSaving(false);
    setMemoSaved(true);
    setTimeout(() => setMemoSaved(false), 2000);
  }

  async function handleSendEmail() {
    if (!emailSubject.trim() || !emailBody.trim() || !session?.user_email) return;
    setEmailSending(true);
    await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: session.user_email, subject: emailSubject, body: emailBody, sessionId }),
    });
    setEmailSending(false);
    setEmailSent(true);
    setEmailSubject("");
    setEmailBody("");
    setTimeout(() => setEmailSent(false), 3000);
    loadEmailLogs(session.user_email);
  }

  const tabStyle = (tab: string) => ({
    flex: 1 as const,
    padding: "8px 0",
    fontSize: 12,
    fontWeight: 700 as const,
    background: "none",
    border: "none",
    borderBottom: activeTab === tab ? "2px solid #9b6ed4" : "2px solid transparent",
    color: activeTab === tab ? "#9b6ed4" : "#bbb",
    cursor: "pointer" as const,
  });

  // セッション区切りを挿入したメッセージリストを生成
  function buildThreadMessages() {
    if (allSessions.length <= 1) return messages;
    const result: (Message | { type: "divider"; sessionId: string; created_at: string; status: string })[] = [];
    let currentSessionId: string | null = null;
    for (const msg of messages) {
      if (msg.session_id !== currentSessionId) {
        const meta = allSessions.find((s) => s.id === msg.session_id);
        if (meta) result.push({ type: "divider", sessionId: meta.id, created_at: meta.created_at, status: meta.status });
        currentSessionId = msg.session_id;
      }
      result.push(msg);
    }
    return result;
  }

  const threadMessages = buildThreadMessages();

  return (
    <div style={{ minHeight: "100vh", background: "#f8f4f4", fontFamily: "'Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", height: "100vh" }}>

        {/* ヘッダー */}
        <div style={{ background: "linear-gradient(135deg,#f4b9b9,#e49bfd,#a3c0ff)", padding: "12px 20px", color: "white", flexShrink: 0 }}>
          <Link href="/chat" style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "block", marginBottom: 4 }}>← 一覧に戻る</Link>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>
                {session ? (session.display_name ?? session.user_email ?? "不明なユーザー") : "読み込み中..."}
              </p>
              {session?.display_name && session.user_email && (
                <p style={{ fontSize: 11, margin: "1px 0 0", opacity: 0.8 }}>{session.user_email}</p>
              )}
              {session && <p style={{ fontSize: 11, margin: "2px 0 0", opacity: 0.85 }}>{STATUS_LABEL[session.status] ?? session.status} · 計{allSessions.length}セッション</p>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleNotify} disabled={notifying} style={{ padding: "7px 14px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.8)", background: "transparent", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                {notifying ? "送信中..." : "📧 開始メール"}
              </button>
              <button onClick={handleComplete} disabled={sending || session?.status === "done"} style={{ padding: "7px 14px", borderRadius: 20, border: "none", background: session?.status === "done" ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.9)", color: session?.status === "done" ? "rgba(255,255,255,0.6)" : "#9b6ed4", fontWeight: 700, cursor: session?.status === "done" ? "default" : "pointer", fontSize: 12 }}>
                {session?.status === "done" ? "対応完了済み" : "✅ 対応完了"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* 左：チャット */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {threadMessages.map((item) => {
                if ("type" in item && item.type === "divider") {
                  return (
                    <div key={`divider-${item.sessionId}`} style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                      <div style={{ flex: 1, height: 1, background: "rgba(200,170,240,0.3)" }} />
                      <span style={{ fontSize: 10, color: "#bbb", whiteSpace: "nowrap" }}>
                        {fmtFull(item.created_at)} {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                      <div style={{ flex: 1, height: 1, background: "rgba(200,170,240,0.3)" }} />
                    </div>
                  );
                }
                const m = item as Message;
                return (
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
                    <span style={{ fontSize: 10, color: "#ccc", marginTop: 2 }}>{fmtFull(m.created_at)}</span>
                  </div>
                );
              })}
              {messages.length === 0 && <p style={{ textAlign: "center", color: "#ccc", fontSize: 13, marginTop: 40 }}>メッセージはまだありません</p>}
              <div ref={bottomRef} />
            </div>

            <div style={{ padding: "10px 12px", borderTop: "0.5px solid rgba(200,170,240,0.2)", display: "flex", gap: 8, alignItems: "flex-end", background: "white", flexShrink: 0 }}>
              <textarea
                ref={inputRef}
                rows={1}
                placeholder="返信を入力... (Enterで送信、Shift+Enterで改行)"
                value={reply}
                onChange={(e) => { setReply(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; handleTyping(); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }}
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

          {/* 右：顧客パネル */}
          <div style={{ width: 320, borderLeft: "1px solid rgba(200,170,240,0.2)", background: "white", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ display: "flex", borderBottom: "1px solid rgba(200,170,240,0.2)", padding: "0 8px" }}>
              <button style={tabStyle("info")} onClick={() => setActiveTab("info")}>👤 顧客情報</button>
              <button style={tabStyle("email")} onClick={() => setActiveTab("email")}>📧 メール</button>
              <button style={tabStyle("memo")} onClick={() => setActiveTab("memo")}>📝 メモ</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>

              {activeTab === "info" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {customerLoading && <p style={{ color: "#bbb", fontSize: 12, textAlign: "center" }}>読み込み中...</p>}
                  {customer && !customerLoading && (
                    <>
                      <section>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#bbb", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 6px" }}>プラン</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18, fontWeight: 800, color: PLAN_COLOR[customer.profile?.plan ?? "free"] }}>
                            {PLAN_LABEL[customer.profile?.plan ?? "free"]}
                          </span>
                          {customer.profile?.plan_status === "past_due" && (
                            <span style={{ fontSize: 11, background: "#fef2f2", color: "#ef4444", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>支払い遅延</span>
                          )}
                          {customer.profile?.cancel_at_period_end && (
                            <span style={{ fontSize: 11, background: "#fff7ed", color: "#f97316", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>解約予約中</span>
                          )}
                        </div>
                        {customer.profile?.current_period_end && (
                          <p style={{ fontSize: 11, color: "#aaa", margin: "4px 0 0" }}>
                            {customer.profile.cancel_at_period_end ? "解約日：" : "次回更新："}{fmt(customer.profile.current_period_end)}
                          </p>
                        )}
                        {customer.profile?.payment_failed_at && (
                          <p style={{ fontSize: 11, color: "#ef4444", margin: "4px 0 0" }}>支払い失敗：{fmt(customer.profile.payment_failed_at)}</p>
                        )}
                        {customer.profile?.trial_end && new Date(customer.profile.trial_end) > new Date() && (
                          <p style={{ fontSize: 11, color: "#8b5cf6", margin: "4px 0 0" }}>トライアル終了：{fmt(customer.profile.trial_end)}</p>
                        )}
                      </section>

                      <section>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#bbb", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 6px" }}>アカウント</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {customer.registeredAt && <p style={{ fontSize: 12, color: "#555", margin: 0 }}>登録日：{fmt(customer.registeredAt)}</p>}
                          {customer.lastSignIn && <p style={{ fontSize: 12, color: "#555", margin: 0 }}>最終ログイン：{fmt(customer.lastSignIn)}</p>}
                          {customer.profile?.status === "deleted" && (
                            <span style={{ fontSize: 11, background: "#f1f5f9", color: "#94a3b8", padding: "2px 8px", borderRadius: 20, fontWeight: 700, display: "inline-block" }}>退会済み</span>
                          )}
                        </div>
                      </section>

                      <section>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#bbb", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 6px" }}>購入教材（{customer.purchases.length}件）</p>
                        {customer.purchases.length === 0
                          ? <p style={{ fontSize: 12, color: "#ccc", margin: 0 }}>なし</p>
                          : customer.purchases.map((p) => (
                            <p key={p.material_id + p.created_at} style={{ fontSize: 12, color: "#555", margin: "0 0 2px" }}>・{p.material_id} <span style={{ color: "#bbb" }}>({fmt(p.created_at)})</span></p>
                          ))
                        }
                      </section>

                      <section>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#bbb", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 6px" }}>DL履歴（計{customer.downloadCount}件）</p>
                        {customer.recentDownloads.length === 0
                          ? <p style={{ fontSize: 12, color: "#ccc", margin: 0 }}>なし</p>
                          : customer.recentDownloads.map((d) => (
                            <p key={d.material_id + d.created_at} style={{ fontSize: 12, color: "#555", margin: "0 0 2px" }}>・{d.material_id} <span style={{ color: "#bbb" }}>({fmt(d.created_at)})</span></p>
                          ))
                        }
                        {customer.downloadCount > 5 && <p style={{ fontSize: 11, color: "#bbb", margin: "4px 0 0" }}>（最新5件を表示）</p>}
                      </section>
                    </>
                  )}
                  {!customer && !customerLoading && (
                    <p style={{ fontSize: 12, color: "#bbb", textAlign: "center" }}>ユーザー情報を取得できません</p>
                  )}
                </div>
              )}

              {activeTab === "email" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <section>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#bbb", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 8px" }}>新規メール送信</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input type="text" placeholder="件名" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(200,170,240,0.5)", fontSize: 12, outline: "none" }} />
                      <textarea placeholder="本文" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={5} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(200,170,240,0.5)", fontSize: 12, outline: "none", resize: "vertical" }} />
                      <button onClick={handleSendEmail} disabled={emailSending || !emailSubject.trim() || !emailBody.trim()} style={{ padding: "9px 0", borderRadius: 20, border: "none", background: emailSubject.trim() && emailBody.trim() ? "linear-gradient(135deg,#f4b9b9,#e49bfd)" : "#e5e5e5", color: emailSubject.trim() && emailBody.trim() ? "white" : "#bbb", fontWeight: 700, fontSize: 13, cursor: emailSubject.trim() && emailBody.trim() ? "pointer" : "default" }}>
                        {emailSending ? "送信中..." : emailSent ? "✅ 送信しました" : "送信する"}
                      </button>
                    </div>
                  </section>
                  <section>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#bbb", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 8px" }}>送信履歴</p>
                    {emailLoading && <p style={{ fontSize: 12, color: "#bbb" }}>読み込み中...</p>}
                    {!emailLoading && emailLogs.length === 0 && <p style={{ fontSize: 12, color: "#ccc" }}>まだ送信履歴がありません</p>}
                    {emailLogs.map((log) => (
                      <div key={log.id} style={{ background: "#f8f4f4", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#555", margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.subject}</p>
                          <p style={{ fontSize: 10, color: "#bbb", margin: "0 0 0 8px", flexShrink: 0 }}>{fmtFull(log.sent_at)}</p>
                        </div>
                        <p style={{ fontSize: 11, color: "#aaa", margin: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{log.body}</p>
                      </div>
                    ))}
                  </section>
                </div>
              )}

              {activeTab === "memo" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#bbb", letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>管理者メモ</p>
                  <p style={{ fontSize: 11, color: "#bbb", margin: 0 }}>このメモはユーザーには表示されません</p>
                  <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="プラン検討中、過去に問い合わせあり、など..." rows={10} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(200,170,240,0.5)", fontSize: 13, outline: "none", resize: "vertical", lineHeight: 1.6 }} />
                  <button onClick={handleSaveMemo} disabled={memoSaving} style={{ padding: "9px 0", borderRadius: 20, border: "none", background: "linear-gradient(135deg,#f4b9b9,#e49bfd)", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    {memoSaving ? "保存中..." : memoSaved ? "✅ 保存しました" : "メモを保存"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
