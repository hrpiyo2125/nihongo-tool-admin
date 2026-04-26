import type { Metadata } from "next";
import "./globals.css";
import DeployWatcher from "@/components/DeployWatcher";

export const metadata: Metadata = {
  title: "toolio 管理",
  robots: "noindex,nofollow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: "'Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif", background: "#f8f4f4", minHeight: "100vh" }}>
        {children}
        <DeployWatcher />
      </body>
    </html>
  );
}
