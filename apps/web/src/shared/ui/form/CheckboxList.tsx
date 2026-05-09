import { useMemo, useState } from "react";

import type { SelectOption } from "./Select";

type CheckboxListProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  emptyMessage?: string;
  onChange: (value: string[]) => void;
  options: SelectOption[];
  searchPlaceholder?: string;
  value: string[];
};

export function CheckboxList({
  ariaLabel,
  className = "",
  disabled = false,
  emptyMessage = "No options found.",
  onChange,
  options,
  searchPlaceholder = "Search...",
  value,
}: CheckboxListProps) {
  const [query, setQuery] = useState("");
  const selectedValues = useMemo(() => new Set(value), [value]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const toggleValue = (optionValue: string) => {
    if (disabled) return;
    if (selectedValues.has(optionValue)) {
      onChange(value.filter((currentValue) => currentValue !== optionValue));
      return;
    }
    onChange([...value, optionValue]);
  };

  return (
    <div className={`checkbox-list ${disabled ? "checkbox-list-disabled" : ""} ${className}`.trim()}>
      <input
        aria-label={`${ariaLabel} search`}
        className="checkbox-list-search"
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        type="search"
        value={query}
      />
      <div aria-label={ariaLabel} className="checkbox-list-options" role="group">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <label
              className={`checkbox-list-row ${option.disabled ? "checkbox-list-row-disabled" : ""}`.trim()}
              key={option.value}
            >
              <input
                checked={selectedValues.has(option.value)}
                disabled={disabled || option.disabled}
                onChange={() => toggleValue(option.value)}
                type="checkbox"
              />
              <span>{option.label}</span>
            </label>
          ))
        ) : (
          <p className="checkbox-list-empty">{emptyMessage}</p>
        )}
      </div>
      <div className="checkbox-list-summary">{value.length} selected</div>
    </div>
  );
}
