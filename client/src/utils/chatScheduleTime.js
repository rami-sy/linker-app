/** Local date/time helpers for chat scheduling modals. */

export function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toTimeInputValue(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Parse YYYY-MM-DD + HH:mm as local time; returns Date or null. */
export function parseLocalDateTime(dateStr, timeStr) {
  const d = String(dateStr || "");
  const t = String(timeStr || "");
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = t.match(/^(\d{2}):(\d{2})$/);
  if (!m || !tm) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hh = Number(tm[1]);
  const mm = Number(tm[2]);
  const dt = new Date(year, monthIndex, day, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export function schedulePresetTarget(preset, now = new Date()) {
  let target = new Date(now);
  if (preset === "in1h") {
    target = new Date(now.getTime() + 60 * 60 * 1000);
  } else if (preset === "tonight") {
    target = new Date(now);
    target.setHours(20, 0, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
  } else if (preset === "tomorrowMorning") {
    target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  }
  return target;
}

export function defaultScheduleBase(offsetMs = 10 * 60 * 1000) {
  return new Date(Date.now() + offsetMs);
}
