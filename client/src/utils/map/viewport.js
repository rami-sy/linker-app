export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const normalizeZoom = (zoom, fallback = 10) => {
  const z = Number(zoom);
  if (Number.isNaN(z)) return fallback;
  return clamp(z, 2, 20);
};

export const buildBoundsFromCenter = (
  latitude,
  longitude,
  zoom = 10,
  screenWidth = 1024
) => {
  const z = normalizeZoom(zoom, 10);
  const lngDelta = 360 / Math.pow(2, z);
  const aspect = Math.max(0.5, Math.min(3, screenWidth / 1024));
  const latDelta = lngDelta / aspect;
  const north = clamp(latitude + latDelta / 2, -85, 85);
  const south = clamp(latitude - latDelta / 2, -85, 85);
  const east = clamp(longitude + lngDelta / 2, -180, 180);
  const west = clamp(longitude - lngDelta / 2, -180, 180);
  return { north, south, east, west };
};

export const getWebViewportFromEvent = (e, fallbackViewport = {}) => {
  if (!e?.detail && !fallbackViewport) return null;
  const fallbackCenter =
    fallbackViewport?.center || fallbackViewport || { latitude: 0, longitude: 0 };
  const lat = Number(e?.detail?.center?.lat ?? fallbackCenter?.latitude ?? 0);
  const lng = Number(e?.detail?.center?.lng ?? fallbackCenter?.longitude ?? 0);
  const zoom = normalizeZoom(
    e?.detail?.zoom,
    normalizeZoom(fallbackViewport?.zoom, 10)
  );
  const bounds =
    e?.detail?.bounds != null
      ? {
          north: Number(e?.detail?.bounds?.north),
          south: Number(e?.detail?.bounds?.south),
          east: Number(e?.detail?.bounds?.east),
          west: Number(e?.detail?.bounds?.west),
        }
      : fallbackViewport?.bounds ?? null;
  return {
    center: { latitude: lat, longitude: lng },
    zoom,
    bounds,
    platform: "web",
  };
};

export const getNativeViewportFromRegion = (region, screenWidth = 1024) => {
  if (!region) return null;
  const latitude = Number(region.latitude ?? 0);
  const longitude = Number(region.longitude ?? 0);
  const longitudeDelta = Math.max(0.000001, Number(region.longitudeDelta || 1));
  const zoom = normalizeZoom(
    Math.log2(360 * (screenWidth / 256 / longitudeDelta)) + 1,
    10
  );
  const latDelta = Math.max(0.000001, Number(region.latitudeDelta || 1));
  const bounds = {
    north: clamp(latitude + latDelta / 2, -85, 85),
    south: clamp(latitude - latDelta / 2, -85, 85),
    east: clamp(longitude + longitudeDelta / 2, -180, 180),
    west: clamp(longitude - longitudeDelta / 2, -180, 180),
  };
  return {
    center: { latitude, longitude },
    zoom,
    bounds,
    platform: "native",
  };
};

