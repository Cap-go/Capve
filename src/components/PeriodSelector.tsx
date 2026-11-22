import { useState } from "react";
import { DateRangePicker } from "./DateRangePicker";

export type Preset = "today" | "yesterday" | "7d" | "14d" | "30d" | "this_month" | "last_month" | "custom" | "all_time";

export type PeriodRange = {
  from?: number;
  to?: number;
};

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
  { value: "all_time", label: "All time" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isoLocal(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function rangeFor(preset: Preset, custom: { from: string; to: string }, now = new Date()): PeriodRange {
  if (preset === "all_time") return {};
  if (preset === "custom") {
    return {
      from: custom.from ? new Date(`${custom.from}T00:00:00`).getTime() : undefined,
      to: custom.to ? new Date(`${custom.to}T23:59:59.999`).getTime() : undefined,
    };
  }

  const today = startOfDay(now);

  if (preset === "today") {
    return { from: today, to: now.getTime() };
  }

  if (preset === "yesterday") {
    const yesterdayStart = today - DAY_MS;
    return { from: yesterdayStart, to: yesterdayStart + DAY_MS - 1 };
  }

  if (preset === "this_month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: now.getTime() };
  }

  if (preset === "last_month") {
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: lastMonthStart.getTime(), to: lastMonthEnd.getTime() };
  }

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 14;
  return { from: today - (days - 1) * DAY_MS, to: now.getTime() };
}

function formatDay(ms: number, withYear = false): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
  });
}

export function rangeLabel(range: PeriodRange): string {
  if (range.from == null || range.to == null) return "All time";
  
  const fromDate = formatDay(range.from, true);
  const toDate = formatDay(range.to, true);
  
  if (fromDate === toDate) return fromDate;
  return `${fromDate} – ${toDate}`;
}

export function PeriodSelector({
  preset,
  customFrom,
  customTo,
  onChange,
}: {
  preset: Preset;
  customFrom: string;
  customTo: string;
  onChange: (preset: Preset, customFrom: string, customTo: string) => void;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const range = rangeFor(preset, { from: customFrom, to: customTo });

  return (
    <div className="perf-range">
      <svg viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">
        <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 6.5h12M5 2v2.5M11 2v2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <span>{rangeLabel(range)}</span>
      <select
        aria-label="Date range"
        value={preset}
        onChange={(e) => {
          const next = e.target.value as Preset;
          if (next === "custom") {
            setRangeOpen(true);
            return;
          }
          onChange(next, customFrom, customTo);
        }}
      >
        {PRESETS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {preset === "custom" && (
        <button className="range-edit" type="button" onClick={() => setRangeOpen(true)}>
          Edit
        </button>
      )}
      {rangeOpen && (
        <DateRangePicker
          from={customFrom}
          to={customTo}
          onClose={() => setRangeOpen(false)}
          onApply={(from, to) => {
            onChange("custom", from, to);
            setRangeOpen(false);
          }}
        />
      )}
    </div>
  );
}
