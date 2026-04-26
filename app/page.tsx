"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") === "ok") router.replace("/chat");
  }, []);

  function handleLogin() {
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      sessionStorage.setItem("admin_auth", "ok");
      router.replace("/chat");
    } else {
      setError(true);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 360, background: "white", borderRadius: 20, padding: 32, boxShadow: "0 4px 24px rgba(155,110,212,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <p style={{ fontSize: 11, letterSpacing: 3, color: "rgba(180,120,210,0.6)", textTransform: "uppercase", marginBottom: 8 }}>Admin</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, background: "linear-gradient(135deg,#f4b9b9,#e49bfd,#a3c0ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>toolio 管理画面</h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input type="password" placeholder="パスワード" value={password} onChange={(e) => { setPassword(e.target.value); setError(false); }} onKeyDown={(e) => e.key === "Enter" && handleLogin()} autoFocus style={{ padding: "12px 16px", borderRadius: 12, border: "1.5px solid rgba(200,170,240,0.5)", fontSize: 14, outline: "none" }} />
          {error && <p style={{ fontSize: 12, color: "#f43f5e", margin: 0 }}>パスワードが違います</p>}
          <button onClick={handleLogin} style={{ padding: "12px 0", borderRadius: 20, border: "none", background: "linear-gradient(135deg,#f4b9b9,#e49bfd)", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>ログイン</button>
        </div>
      </div>
    </div>
  );
}
