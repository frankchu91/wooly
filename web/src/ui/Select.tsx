import clsx from "clsx";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  searchable?: boolean;
  placeholder?: string;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  searchable,
  placeholder,
  className,
}: SelectProps) {
  if (searchable) {
    return (
      <SearchableSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={clsx(
        "w-full rounded-control border border-muted/25 bg-surface px-3 py-2 text-ink",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type SearchableSelectProps = Omit<SelectProps, "searchable">;

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  className,
}: SearchableSelectProps) {
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [syncedLabel, setSyncedLabel] = useState(selected?.label);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the input's text in sync when `value` changes from outside (e.g. a
  // parent resetting the field) without re-syncing on every keystroke while
  // the user is typing. This mirrors React's "adjusting state during
  // render" pattern rather than a setState-in-effect.
  if (selected?.label !== syncedLabel) {
    setSyncedLabel(selected?.label);
    setQuery(selected?.label ?? "");
  }

  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function selectOption(option: SelectOption) {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const option = filtered[activeIndex];
      if (open && option) {
        event.preventDefault();
        selectOption(option);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={clsx(
          "w-full rounded-control border border-muted/25 bg-surface px-3 py-2 text-ink",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          className,
        )}
      />
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-control bg-surface p-1 shadow-card"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No matches</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(option);
                }}
                className={clsx(
                  "cursor-pointer rounded-control px-3 py-2 text-sm",
                  index === activeIndex ? "bg-mint text-primary-dark" : "text-ink hover:bg-mint/60",
                )}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
