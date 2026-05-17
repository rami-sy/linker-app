/**
 * Human-friendly label for a future scheduled send time (chat bubbles + scheduled list).
 * Uses the same i18n keys as chat.scheduledFriendly* in ar/en.
 *
 * @param {string|Date|number} scheduledAt
 * @param {{ t: (key: string, opts?: object) => string; locale?: string }} options
 * @returns {string}
 */
export function formatFriendlyScheduledAt(scheduledAt, { t, locale }) {
  if (scheduledAt == null || scheduledAt === "") return "";
  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) return "";

  const diffMs = parsed.getTime() - Date.now();
  if (diffMs <= 0) {
    return t("chat.scheduledRelativeSoon", { defaultValue: "soon" });
  }

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  try {
    const timeFormatter = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
    const weekdayFormatter = new Intl.DateTimeFormat(locale, {
      weekday: "long",
    });
    const dayMonthFormatter = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
    });
    const fullDateFormatter = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const relativeFormatter = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
    });

    if (diffMs <= hourMs) {
      const relativeMinutes = Math.max(1, Math.round(diffMs / minuteMs));
      return t("chat.scheduledFriendlyWithinHour", {
        defaultValue: "Scheduled {{relative}}",
        relative: relativeFormatter.format(relativeMinutes, "minute"),
      });
    }

    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const targetStart = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate()
    ).getTime();
    const dayDiff = Math.round((targetStart - todayStart) / dayMs);
    const timeLabel = timeFormatter.format(parsed);

    if (dayDiff === 1) {
      return t("chat.scheduledFriendlyTomorrow", {
        defaultValue: "Scheduled tomorrow at {{time}}",
        time: timeLabel,
      });
    }

    if (dayDiff > 1 && dayDiff <= 7) {
      return t("chat.scheduledFriendlyNextWeek", {
        defaultValue: "Scheduled next week {{weekday}} at {{time}}",
        weekday: weekdayFormatter.format(parsed),
        time: timeLabel,
      });
    }

    if (parsed.getFullYear() === now.getFullYear()) {
      return t("chat.scheduledFriendlySameYear", {
        defaultValue: "Scheduled for {{dayMonth}} at {{time}}",
        dayMonth: dayMonthFormatter.format(parsed),
        time: timeLabel,
      });
    }

    return t("chat.scheduledFriendlyNextYear", {
      defaultValue: "Scheduled for {{dateTime}}",
      dateTime: fullDateFormatter.format(parsed),
    });
  } catch (_) {
    return "";
  }
}
