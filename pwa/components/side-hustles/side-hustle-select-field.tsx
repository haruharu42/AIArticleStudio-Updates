import {
  SIDE_HUSTLE_CUSTOM_VALUE,
  type SideHustleField,
  type SideHustleFieldValue,
} from "@/features/side-hustles/types";

type Props = {
  field: SideHustleField;
  value: SideHustleFieldValue;
  onChange: (value: SideHustleFieldValue) => void;
};

export function SideHustleSelectField({ field, value, onChange }: Props) {
  const custom = value.selected === SIDE_HUSTLE_CUSTOM_VALUE;

  return (
    <label className={custom && field.customMultiline ? "side-hustle-field wide" : "side-hustle-field"}>
      <span className="side-hustle-field-label">{field.label}</span>
      <small>{field.help}</small>
      <select
        value={value.selected}
        onChange={(event) => onChange({ ...value, selected: event.target.value })}
      >
        {field.options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
      {custom && (
        field.customMultiline ? (
          <textarea
            rows={4}
            value={value.custom}
            onChange={(event) => onChange({ ...value, custom: event.target.value })}
            placeholder={field.customPlaceholder}
          />
        ) : (
          <input
            value={value.custom}
            onChange={(event) => onChange({ ...value, custom: event.target.value })}
            placeholder={field.customPlaceholder}
          />
        )
      )}
    </label>
  );
}
