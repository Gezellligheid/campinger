"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";

interface DateRangePickerProps {
  checkin: string;
  checkout: string;
  onChange: (checkin: string, checkout: string) => void;
  className?: string;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const POPOVER_WIDTH = 560;

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function fromISO(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Monday-first 6x7 grid; null = blank leading/trailing cell.
function buildMonthGrid(monthStart: Date): (Date | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const leadingBlanks = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function DateRangePicker({
  checkin,
  checkout,
  onChange,
  className = "",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const start = fromISO(checkin);
  const end = fromISO(checkout);
  const today = startOfDay(new Date());

  const [viewMonth, setViewMonth] = useState(() => addMonths(start ?? today, 0));

  function updatePosition() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 16;
    let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - POPOVER_WIDTH - margin));
    setCoords({ top: rect.bottom + 8, left });
  }

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        wrapperRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleReposition() {
      updatePosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  function handleDayClick(day: Date) {
    if (day < today) return;

    if (!start || (start && end)) {
      onChange(toISO(day), "");
      return;
    }
    if (start && !end) {
      if (day < start) {
        onChange(toISO(day), "");
      } else {
        onChange(toISO(start), toISO(day));
        setOpen(false);
      }
    }
  }

  const rangeStart = start;
  const rangeEnd = end ?? (start && hoverDate && hoverDate > start ? hoverDate : null);

  function isInRange(day: Date) {
    if (!rangeStart || !rangeEnd) return false;
    return day > rangeStart && day < rangeEnd;
  }

  function isEndpoint(day: Date) {
    return (
      (rangeStart && day.getTime() === rangeStart.getTime()) ||
      (end && day.getTime() === end.getTime())
    );
  }

  function renderMonth(monthStart: Date) {
    const cells = buildMonthGrid(monthStart);
    return (
      <div className="flex-1">
        <div className="mb-2 text-center text-sm font-semibold text-ink-900">
          {monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium text-ink-500">
          {WEEKDAYS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const disabled = day < today;
            const inRange = isInRange(day);
            const endpoint = isEndpoint(day);
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(day)}
                onMouseEnter={() => setHoverDate(day)}
                className={`relative mx-auto flex h-8 w-8 items-center justify-center text-sm transition-colors ${
                  disabled
                    ? "cursor-not-allowed text-ink-100"
                    : endpoint
                      ? "rounded-full bg-forest-600 font-semibold text-sand-50"
                      : inRange
                        ? "bg-forest-100 text-forest-800"
                        : "text-ink-700 hover:bg-sand-100"
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const label =
    start && end
      ? `${formatShort(start)} – ${formatShort(end)}`
      : start
        ? `${formatShort(start)} – Add end date`
        : "Add dates";

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left transition-colors hover:bg-sand-100/60"
      >
        <CalendarRange className="h-5 w-5 shrink-0 text-terracotta-500" />
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Dates
          </span>
          <span
            className={`truncate text-sm ${start ? "text-ink-900" : "text-ink-300"}`}
          >
            {label}
          </span>
        </div>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
            className="z-50 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-5 shadow-xl shadow-forest-900/15 ring-1 ring-forest-900/10"
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                disabled={viewMonth <= addMonths(today, 0)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-sand-100 disabled:invisible"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onChange("", "")}
                className="text-xs font-semibold text-terracotta-600 hover:text-terracotta-700"
              >
                Clear dates
              </button>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-sand-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div
              className="flex flex-col gap-6 sm:flex-row sm:gap-4"
              onMouseLeave={() => setHoverDate(null)}
            >
              {renderMonth(viewMonth)}
              <div className="hidden sm:block">{renderMonth(addMonths(viewMonth, 1))}</div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
