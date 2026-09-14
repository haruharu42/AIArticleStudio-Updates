"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="legal-commerce-page"><article><h2>販売条件を表示できませんでした</h2><p>販売条件の読み込み中にエラーが発生しました。</p><button type="button" onClick={reset}>再試行</button></article></main>;
}
