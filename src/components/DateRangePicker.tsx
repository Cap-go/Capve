import { useEffect, useId, useState } from "react";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function iso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1) return null;
  return date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function monthCells(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const weeks: Date[] = [];
  for (let index = 0; index < cells.length; index += 7) {
    const week = cells.slice(index, index + 7);
    if (week.some((date) => date.getMonth() === month)) weeks.push(...week);
  }
  return weeks;
}

function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * Two-month range popover. A click sets a single day (start and end). The next click
 * extends that day into a range. A click after a range starts a new day.
 */
export function DateRangePicker({
  from,
  to,
  onApply,
  onClose,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const today = startOfDay(new Date());
  const initialEnd = parseIso(to) ?? parseIso(from) ?? today;
  const initialRight = { year: initialEnd.getFullYear(), month: initialEnd.getMonth() };
  const [right, setRight] = useState(initialRight);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to || from);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = addMonths(right.year, right.month, -1);
  const atCurrentMonth = right.year === today.getFullYear() && right.month === today.getMonth();
  const start = parseIso(draftFrom);
  const end = parseIso(draftTo);
  const startKey = start ? iso(start) : "";
  const endKey = end ? iso(end) : "";

  function pick(date: Date) {
    if (date > today) return;
    const key = iso(date);
    if (!extending || !startKey) {
      setDraftFrom(key);
      setDraftTo(key);
      setExtending(true);
      return;
    }
    if (key < startKey) {
      setDraftFrom(key);
      setDraftTo(startKey);
    } else {
      setDraftTo(key);
    }
    setExtending(false);
  }

  function apply() {
    const nextFrom = parseIso(draftFrom);
    const nextTo = parseIso(draftTo);
    if (!nextFrom || !nextTo || nextFrom > today || nextTo > today || nextFrom > nextTo) return;
    onApply(iso(nextFrom), iso(nextTo));
  }

  const canApply = Boolean(start && end && start <= end && start <= today && end <= today);

  return (
    <div className="range-popover-backdrop" onMouseDown={onClose}>
      <div
        className="range-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          Custom range
        </h2>
        <div className="range-popover-months">
          <button
            className="range-nav"
            type="button"
            aria-label="Previous month"
            onClick={() => setRight(addMonths(right.year, right.month, -1))}
          >
            ‹
          </button>
          <Month
            year={left.year}
            month={left.month}
            today={today}
            startKey={startKey}
            endKey={endKey}
            onPick={pick}
          />
          <Month
            year={right.year}
            month={right.month}
            today={today}
            startKey={startKey}
            endKey={endKey}
            onPick={pick}
          />
          <button
            className="range-nav"
            type="button"
            aria-label="Next month"
            disabled={atCurrentMonth}
            onClick={() => setRight(addMonths(right.year, right.month, 1))}
          >
            ›
          </button>
        </div>
        <div className="range-popover-footer">
          <label>
            Start
            <input
              value={draftFrom}
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              onChange={(event) => {
                setDraftFrom(event.target.value);
                setExtending(false);
              }}
            />
          </label>
          <label>
            End
            <input
              value={draftTo}
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              onChange={(event) => {
                setDraftTo(event.target.value);
                setExtending(false);
              }}
            />
          </label>
          <button
            className="range-clear"
            type="button"
            onClick={() => {
              setDraftFrom("");
              setDraftTo("");
              setExtending(false);
            }}
          >
            Clear
          </button>
          <button className="range-apply" type="button" disabled={!canApply} onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function Month({
  year,
  month,
  today,
  startKey,
  endKey,
  onPick,
}: {
  year: number;
  month: number;
  today: Date;
  startKey: string;
  endKey: string;
  onPick: (date: Date) => void;
}) {
  return (
    <div className="range-month">
      <div className="range-month-title">{monthTitle(year, month)}</div>
      <div className="range-weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="range-days">
        {monthCells(year, month).map((date) => {
          const key = iso(date);
          const inMonth = date.getMonth() === month;
          const future = date > today;
          const selected = key === startKey || key === endKey;
          const inRange = Boolean(startKey && endKey && key > startKey && key < endKey);
          return (
            <button
              key={key}
              type="button"
              disabled={future}
              className={[
                inMonth ? "" : "is-outside",
                selected ? "is-selected" : "",
                inRange ? "is-in-range" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onPick(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
