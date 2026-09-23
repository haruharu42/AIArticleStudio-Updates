const STEPS = ["基本設定", "詳細設定", "AI設定", "完成プロンプト"] as const;

export function SideHustleStepRail({ step }: { step: number }) {
  return (
    <ol className="side-hustle-step-rail" aria-label="副業機能の進行状況">
      {STEPS.map((label, index) => (
        <li
          key={label}
          className={index === step ? "active" : index < step ? "done" : ""}
          aria-current={index === step ? "step" : undefined}
        >
          <span>{index < step ? "✓" : index + 1}</span>
          <b>{label}</b>
        </li>
      ))}
    </ol>
  );
}
