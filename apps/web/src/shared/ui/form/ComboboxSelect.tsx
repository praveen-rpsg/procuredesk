import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboboxOption = {
  description?: string;
  disabled?: boolean;
  label: string;
  value: string;
};

type ComboboxSelectProps = {
  disabled?: boolean;
  emptyMessage?: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder: string;
  searchPlaceholder?: string;
  value: string;
};

export function ComboboxSelect({
  disabled = false,
  emptyMessage = "No options found.",
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search...",
  value,
}: ComboboxSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.description?.toLowerCase().includes(query),
    );
  }, [options, search]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  const selectOption = (option: ComboboxOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <div className="combobox-select" ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        className="combobox-select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span className={selectedOption ? "" : "combobox-select-placeholder"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown size={18} />
      </button>
      {isOpen ? (
        <div className="combobox-select-popover">
          <div className="combobox-select-search">
            <Search size={16} />
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              ref={searchRef}
              value={search}
            />
          </div>
          <div className="combobox-select-options" id={listboxId} role="listbox">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  aria-selected={option.value === value}
                  className={`combobox-select-option ${
                    option.value === value ? "combobox-select-option-selected" : ""
                  }`.trim()}
                  disabled={option.disabled}
                  key={option.value}
                  onClick={() => selectOption(option)}
                  role="option"
                  type="button"
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  {option.value === value ? <Check size={17} /> : null}
                </button>
              ))
            ) : (
              <p className="combobox-select-empty">{emptyMessage}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
