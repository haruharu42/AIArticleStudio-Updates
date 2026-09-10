import Link from "next/link";
import type { ReactNode } from "react";

export function LegalDocument({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f6f8fc",
        color: "#14213d",
        padding: "32px 16px 64px",
      }}
    >
      <article
        style={{
          maxWidth: 820,
          margin: "0 auto",
          background: "#ffffff",
          border: "1px solid #dbe3f0",
          borderRadius: 20,
          padding: "clamp(22px, 5vw, 44px)",
          boxShadow: "0 18px 50px rgba(20, 33, 61, 0.08)",
          lineHeight: 1.85,
        }}
      >
        <Link href="/" style={{ color: "#2457d6", textDecoration: "none" }}>
          ← AI記事スタジオへ戻る
        </Link>
        <p
          style={{
            display: "inline-block",
            margin: "24px 0 8px",
            padding: "5px 10px",
            borderRadius: 999,
            background: "#fff5cc",
            color: "#6a4a00",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          公開準備ドラフト
        </p>
        <h1 style={{ margin: "8px 0 10px", fontSize: "clamp(28px, 5vw, 40px)" }}>
          {title}
        </h1>
        <p style={{ marginTop: 0, color: "#5b6578" }}>{description}</p>
        <p style={{ color: "#6a4a00", fontSize: 14 }}>
          この文書はPWA preview検証用のドラフトです。一般販売・正式公開前に運営者情報、販売条件、問い合わせ窓口を確定し、必要に応じて専門家の確認を受けます。
        </p>
        <hr style={{ border: 0, borderTop: "1px solid #e5eaf2", margin: "28px 0" }} />
        <div>{children}</div>
        <hr style={{ border: 0, borderTop: "1px solid #e5eaf2", margin: "32px 0 20px" }} />
        <nav aria-label="法的文書" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <Link href="/terms">利用規約</Link>
          <Link href="/privacy">プライバシーポリシー</Link>
          <Link href="/ai-terms">AI利用条件</Link>
        </nav>
      </article>
    </main>
  );
}
