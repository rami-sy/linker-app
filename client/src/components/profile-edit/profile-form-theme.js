/** Shared visual tokens for update-profile and related forms (aligns with app brand #0a97b9). */

export const PROFILE_BRAND = "#0a97b9";

export const getProfileFormChrome = (isDark) => ({
  fieldBg: isDark ? "#171b25" : "#f6f8f9",
  fieldBorder: isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(148, 163, 184, 0.22)",
  fieldShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.2 : 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  placeholder: isDark ? "#94a3b8" : "#64748b",
  labelClass:
    "mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400",
  menuSurface: isDark ? "rgba(21, 26, 36, 0.97)" : "rgba(255, 255, 255, 0.98)",
  menuBorder: isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.25)",
});
