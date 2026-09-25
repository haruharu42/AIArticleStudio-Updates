"use client";

import { useEffect, useId, useMemo, useState } from "react";

export type SelectWithCustomOption = {
  value: string;
  label: string;
  note?: string;
};

function normalizeOptions(options: readonly (string | SelectWithCustomOption)[]) {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

export function SelectWithCustom({
  label,
  value,
  onChange,
  options,
  description,
  placeholder = "選択してください",
  customPlaceholder = "自由入力してください",
  className = "",
  disabled = false,
  inputType = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (string | SelectWithCustomOption)[];
  description?: string;
  placeholder?: string;
  customPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  inputType?: "text" | "url";
  maxLength?: number;
}) {
  const inputId = useId();
  const normalized = useMemo(() => normalizeOptions(options), [options]);
  const preset = normalized.find((option) => option.value === value);
  const [forceCustom, setForceCustom] = useState(false);
  const custom = forceCustom || (Boolean(value) && !preset);

  useEffect(() => {
    if (preset) setForceCustom(false);
  }, [preset]);

  return (
    <label className={`smart-select-field ${className}`.trim()}>
      <span>{label}</span>
      {description && <small className="smart-select-help">{description}</small>}
      <select
        value={custom ? "__custom__" : preset?.value ?? ""}
        disabled={disabled}
        aria-controls={custom ? inputId : undefined}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "__custom__") {
            setForceCustom(true);
            if (preset) onChange("");
            return;
          }
          setForceCustom(false);
          onChange(next);
        }}
      >
        <option value="">{placeholder}</option>
        {normalized.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        <option value="__custom__">その他・自由入力</option>
      </select>
      {custom && (
        <input
          id={inputId}
          type={inputType}
          value={preset ? "" : value}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={customPlaceholder}
        />
      )}
      {preset?.note && <small className="smart-select-note">{preset.note}</small>}
    </label>
  );
}

export function PresetNumberSelectWithCustom({
  label,
  value,
  onChange,
  presets,
  description,
  suffix = "",
  min = 0,
  max = 1000000,
  className = "",
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  presets: readonly number[];
  description?: string;
  suffix?: string;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const preset = presets.includes(value);
  const [forceCustom, setForceCustom] = useState(!preset);
  const custom = forceCustom || !preset;

  useEffect(() => {
    if (preset) setForceCustom(false);
  }, [preset]);

  return (
    <label className={`smart-select-field ${className}`.trim()}>
      <span>{label}</span>
      {description && <small className="smart-select-help">{description}</small>}
      <select
        value={custom ? "__custom__" : String(value)}
        disabled={disabled}
        aria-controls={custom ? inputId : undefined}
        onChange={(event) => {
          if (event.target.value === "__custom__") {
            setForceCustom(true);
            return;
          }
          setForceCustom(false);
          onChange(Number(event.target.value));
        }}
      >
        {presets.map((presetValue) => (
          <option key={presetValue} value={presetValue}>{presetValue.toLocaleString("ja-JP")}{suffix}</option>
        ))}
        <option value="__custom__">その他・自由入力</option>
      </select>
      {custom && (
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          disabled={disabled}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            onChange(Math.max(min, Math.min(max, next)));
          }}
        />
      )}
    </label>
  );
}
