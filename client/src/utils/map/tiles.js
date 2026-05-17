import { clamp, normalizeZoom } from "./viewport";

const MAX_LAT = 85.05112878;

const lonToTileX = (lon, z) => {
  const n = Math.pow(2, z);
  return Math.floor(((lon + 180) / 360) * n);
};

const latToTileY = (lat, z) => {
  const n = Math.pow(2, z);
  const clampedLat = clamp(lat, -MAX_LAT, MAX_LAT);
  const rad = (clampedLat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return Math.floor(y);
};

export const makeTileKey = (z, x, y) => `${z}:${x}:${y}`;

export const tileKeyToXYZ = (tileKey) => {
  const [z, x, y] = String(tileKey)
    .split(":")
    .map((n) => Number(n));
  return { z, x, y };
};

const tileXToLon = (x, z) => (x / Math.pow(2, z)) * 360 - 180;

const tileYToLat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export const tileKeyToBounds = (tileKey) => {
  const { z, x, y } = tileKeyToXYZ(tileKey);
  const west = tileXToLon(x, z);
  const east = tileXToLon(x + 1, z);
  const north = tileYToLat(y, z);
  const south = tileYToLat(y + 1, z);
  return { north, south, east, west };
};

export const getTileKeysForBounds = (bounds, zoom) => {
  if (!bounds) return [];
  const z = normalizeZoom(zoom, 10);
  const worldTiles = Math.pow(2, z);
  const xMin = clamp(lonToTileX(bounds.west, z), 0, worldTiles - 1);
  const xMax = clamp(lonToTileX(bounds.east, z), 0, worldTiles - 1);
  const yMin = clamp(latToTileY(bounds.north, z), 0, worldTiles - 1);
  const yMax = clamp(latToTileY(bounds.south, z), 0, worldTiles - 1);
  const keys = [];
  for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x += 1) {
    for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y += 1) {
      keys.push(makeTileKey(z, x, y));
    }
  }
  return keys;
};

export const isUserInBounds = (user, bounds) => {
  const lat = Number(user?.location?.coordinates?.[1]);
  const lng = Number(user?.location?.coordinates?.[0]);
  if (Number.isNaN(lat) || Number.isNaN(lng) || !bounds) return false;
  return (
    lat <= bounds.north &&
    lat >= bounds.south &&
    lng <= bounds.east &&
    lng >= bounds.west
  );
};

