"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="commerce-page"><section className="commerce-empty"><h2>利用プランを表示できませんでした</h2><p>販売情報の読み込み中にエラーが発生しました。</p><button type="button" onClick={reset}>再試行</button></section></main>;
}
