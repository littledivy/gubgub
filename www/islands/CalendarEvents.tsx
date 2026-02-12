import { useState } from "preact/hooks";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  meet_url: string;
  organizer: string;
  description?: string;
}

interface Props {
  events: CalendarEvent[];
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function CalendarEvents({ events }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [invited, setInvited] = useState<Record<string, string>>({});

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = new Date(ev.start).toDateString();
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(ev);
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(today);
  };

  const handleInviteBot = async (event: CalendarEvent) => {
    setInvited((prev) => ({ ...prev, [event.id]: "inviting" }));
    try {
      const res = await fetch(`/api/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: event.title || "Untitled Meeting",
          meet_url: event.meet_url,
          auth_mode: "guest",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create meeting");
      }
      const meeting = await res.json();
      setInvited((prev) => ({ ...prev, [event.id]: meeting.id }));
    } catch (_e) {
      setInvited((prev) => ({ ...prev, [event.id]: "error" }));
    }
  };

  const selectedKey = selectedDate.toDateString();
  const selectedEvents = eventsByDate.get(selectedKey) || [];

  const isToday = sameDay(selectedDate, today);
  const selectedLabel = isToday
    ? "today"
    : selectedDate.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).toLowerCase();

  return (
    <div>
      {/* Month calendar grid */}
      <div class="cal-grid">
        <div class="cal-header">
          <button type="button" class="cal-nav" onClick={prevMonth}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 12L6 8l4-4"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button type="button" class="cal-month-label" onClick={goToday}>
            {MONTHS[viewMonth]} {viewYear}
          </button>
          <button type="button" class="cal-nav" onClick={nextMonth}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <div class="cal-weekdays">
          {WEEKDAYS.map((d) => <div key={d} class="cal-weekday">{d}</div>)}
        </div>

        <div class="cal-days">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} class="cal-day cal-day-empty" />;
            }
            const cellDate = new Date(viewYear, viewMonth, day);
            const isSelected = sameDay(cellDate, selectedDate);
            const isCellToday = sameDay(cellDate, today);
            const hasEvents = eventsByDate.has(cellDate.toDateString());

            let cls = "cal-day";
            if (isSelected) cls += " cal-day-selected";
            if (isCellToday && !isSelected) cls += " cal-day-today";

            return (
              <button
                key={`day-${day}`}
                type="button"
                class={cls}
                onClick={() => setSelectedDate(cellDate)}
              >
                <span>{day}</span>
                {hasEvents && <span class="cal-dot" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Event list for selected day */}
      <div class="cal-detail">
        <div class="cal-detail-header">{selectedLabel}</div>
        {selectedEvents.length === 0
          ? <div class="cal-detail-empty">No meetings</div>
          : (
            selectedEvents.map((ev) => {
              const status = invited[ev.id];
              return (
                <div key={ev.id} class="card">
                  <div class="flex-between">
                    <span class="card-title">{ev.title || "untitled"}</span>
                    <span class="text-xs text-light">
                      {formatDuration(ev.start, ev.end)}
                    </span>
                  </div>
                  <div class="card-meta">
                    {formatTime(ev.start)} – {formatTime(ev.end)}
                    {ev.organizer && ` · ${ev.organizer}`}
                  </div>
                  <div class="card-url">{ev.meet_url}</div>
                  <div class="mt-1">
                    {!status
                      ? (
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          onClick={() => handleInviteBot(ev)}
                        >
                          Record
                        </button>
                      )
                      : status === "inviting"
                      ? (
                        <button type="button" class="btn btn-sm" disabled>
                          Starting...
                        </button>
                      )
                      : status === "error"
                      ? (
                        <span class="text-sm" style="color: var(--error)">
                          Failed to start
                        </span>
                      )
                      : (
                        <a href={`/meetings/${status}`} class="text-sm">
                          View meeting →
                        </a>
                      )}
                  </div>
                </div>
              );
            })
          )}
      </div>
    </div>
  );
}
