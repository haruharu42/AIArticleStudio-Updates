"use client";

import { useEffect } from "react";

import { errorMessage, reportClientError } from "@/lib/ops";

export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void reportClientError({
      errorCode: "ROUTE_RENDER_ERROR",
      message: errorMessage(error),
      feature: "next-error-boundary",
      route: window.location.pathname,
      requestId: error.digest,
    });
  }, [error]);

  return (
    <main className="standalone-page">
      <section className="standalone-card">
        <p className="eyebrow">SYSTEM ERROR</p>
        <h1>画面を表示できませんでした</h1>
        <p className="route-notice error">エラーは運用ログへ安全に記録されました。再読み込みしても直らない場合は管理者へお問い合わせください。</p>
        <div className="admin-actions">
          <button className="primary-action" type="button" onClick={reset}>もう一度試す</button>
          <a className="route-back" href="/">ホームへ戻る</a>
        </div>
      </section>
    </main>
  );
}
