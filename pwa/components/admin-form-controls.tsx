"use client";

import { useId, useState } from "react";

export type AdminChoiceOption = {
  value: string;
  label: string;
  note?: string;
};

export function AdminSelectWithCustom({
  label,
  value,
  onChange,
  options,
  description,
  placeholder = "選択してください",
  customPlaceholder = "自由入力してください",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (string | AdminChoiceOption)[];
  description?: string;
  placeholder?: string;
  customPlaceholder?: string;
  className?: string;
}) {
  const normalized = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
  const preset = normalized.find((option) => option.value === value);
  const [customMode, setCustomMode] = useState(false);
  const showCustom = customMode || (Boolean(value) && !preset);
  const selectedNote = preset?.note;

  return (
    <label className={`admin-smart-field ${className}`.trim()}>
      <span>{label}</span>
      {description && <small className="admin-smart-field-help">{description}</small>}
      <select
        value={showCustom ? "__custom__" : preset?.value ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "__custom__") {
            setCustomMode(true);
            if (preset) onChange("");
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
      >
        <option value="">{placeholder}</option>
        {normalized.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        <option value="__custom__">その他・自由入力</option>
      </select>
      {showCustom && (
        <input
          value={preset ? "" : value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={customPlaceholder}
        />
      )}
      {selectedNote && <small className="admin-smart-field-note">{selectedNote}</small>}
    </label>
  );
}

export function AdminPresetNumberField({
  label,
  value,
  onChange,
  presets,
  min = 0,
  max = 10000,
  description,
  suffix,
  className = "",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  presets: readonly number[];
  min?: number;
  max?: number;
  description?: string;
  suffix?: string;
  className?: string;
}) {
  const id = useId();
  const presetValue = presets.includes(value) ? String(value) : "__custom__";
  const [customMode, setCustomMode] = useState(!presets.includes(value));
  const showCustom = customMode || presetValue === "__custom__";

  return (
    <label className={`admin-smart-field ${className}`.trim()}>
      <span>{label}</span>
      {description && <small className="admin-smart-field-help">{description}</small>}
      <select
        aria-controls={showCustom ? id : undefined}
        value={showCustom ? "__custom__" : presetValue}
        onChange={(event) => {
          if (event.target.value === "__custom__") {
            setCustomMode(true);
            return;
          }
          setCustomMode(false);
          onChange(Number(event.target.value));
        }}
      >
        {presets.map((preset) => (
          <option key={preset} value={preset}>{preset}{suffix ?? ""}</option>
        ))}
        <option value="__custom__">その他・自由入力</option>
      </select>
      {showCustom && (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
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

export function AdminSimpleSelect({
  label,
  value,
  onChange,
  options,
  description,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly AdminChoiceOption[];
  description?: string;
  className?: string;
}) {
  return (
    <label className={`admin-smart-field ${className}`.trim()}>
      <span>{label}</span>
      {description && <small className="admin-smart-field-help">{description}</small>}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {options.find((option) => option.value === value)?.note && (
        <small className="admin-smart-field-note">
          {options.find((option) => option.value === value)?.note}
        </small>
      )}
    </label>
  );
}
