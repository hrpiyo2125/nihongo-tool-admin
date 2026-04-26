"use client";
import { useEffect, useRef, useState } from "react";

export default function DeployWatcher() {
  const [outdated, setOutdated] = useState(false);
  const baseId = useRef<string | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (baseId.current === null) { baseId.current = buildId; return; }
        if (baseId.current !== buildId) setOutdated(true);
      } catch { /* ignore */ }
    }

    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!outdated) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999, background: "#7a50b0", color: "white", textAlign: "center", padding: "10px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
      サイトが更新されました。最新版を読み込むにはページを再読み込みしてください。
      <button onClick={() => window.location.reload()} style={{ padding: "5px 14px", borderRadius: 14, border: "none", background: "white", color: "#7a50b0", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
        再読み込み
      </button>
    </div>
  );
}
