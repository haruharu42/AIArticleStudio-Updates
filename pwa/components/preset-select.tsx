"use client";

export type PresetOption = {
  value: string;
  label: string;
};

type PresetSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly PresetOption[];
  full?: boolean;
  disabled?: boolean;
  customPlaceholder?: string;
  otherLabel?: string;
  customInputType?: "text" | "number";
  customMin?: number;
  customMax?: number;
};

const OTHER_VALUE = "__aas_other__";

export function PresetSelect({
  label,
  value,
  onChange,
  options,
  full = false,
  disabled = false,
  customPlaceholder = "自由に入力してください",
  otherLabel = "その他（自由入力）",
  customInputType = "text",
  customMin,
  customMax,
}: PresetSelectProps) {
  const isPreset = options.some((option) => option.value === value);
  const selection = isPreset ? value : OTHER_VALUE;

  return (
    <label className={`route-field${full ? " full" : ""}`}>
      <span>{label}</span>
      <select
        value={selection}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === OTHER_VALUE ? "" : next);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        <option value={OTHER_VALUE}>{otherLabel}</option>
      </select>
      {selection === OTHER_VALUE && (
        <input
          type={customInputType}
          inputMode={customInputType === "number" ? "numeric" : undefined}
          min={customMin}
          max={customMax}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={customPlaceholder}
          maxLength={customInputType === "text" ? 160 : undefined}
        />
      )}
    </label>
  );
}
