export const NAV_ACTIVE_TINT = "#0a97b9";

export const getNavPalette = (isDarkColorScheme) => ({
  activeTint: NAV_ACTIVE_TINT,
  inactiveTint: isDarkColorScheme ? "#cbd5e1" : "#0f2a4a",
  shellBg: isDarkColorScheme
    ? "rgba(21, 26, 36, 0.94)"
    : "rgba(248, 250, 251, 0.96)",
  shellBorder: isDarkColorScheme
    ? "rgba(148, 163, 184, 0.25)"
    : "rgba(148, 163, 184, 0.28)",
  activePill: isDarkColorScheme ? "bg-[#0a97b9]/25" : "bg-[#0a97b9]/15",
  idlePill: isDarkColorScheme ? "bg-[#1e2534]" : "bg-slate-100",
});

export const getShellShadowStyle = (isDarkColorScheme, height = 10) => ({
  shadowColor: "#000",
  shadowOffset: { width: 0, height },
  shadowOpacity: isDarkColorScheme ? 0.28 : 0.12,
  shadowRadius: 16,
  elevation: 8,
});

