import { normalizeZoom } from "./viewport";

const getCoords = (entity) => {
  const latitude = Number(entity?.location?.coordinates?.[1]);
  const longitude = Number(entity?.location?.coordinates?.[0]);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return { latitude, longitude };
};

const cellSizeForZoom = (zoom, cellFactor = 1) => {
  const z = normalizeZoom(zoom, 10);
  const baseDegrees = 360 / Math.pow(2, z);
  return Math.max(0.02, baseDegrees * 1.8 * cellFactor);
};

const getBounds = (coordsList) => {
  if (!coordsList.length) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const c of coordsList) {
    if (c.latitude > north) north = c.latitude;
    if (c.latitude < south) south = c.latitude;
    if (c.longitude > east) east = c.longitude;
    if (c.longitude < west) west = c.longitude;
  }
  return { north, south, east, west };
};

const getDiagonalDegrees = (bounds) => {
  if (!bounds) return 0;
  const latDelta = Math.abs((bounds.north || 0) - (bounds.south || 0));
  const lngDelta = Math.abs((bounds.east || 0) - (bounds.west || 0));
  return Math.sqrt(latDelta * latDelta + lngDelta * lngDelta);
};

const shouldSkipClustering = (users, cellSize, options = {}) => {
  const minCountToSkipClustering = Number(options.minCountToSkipClustering ?? 8);
  const maxCountForSpreadCheck = Number(options.maxCountForSpreadCheck ?? 24);
  const spreadCellMultiplier = Number(options.spreadCellMultiplier ?? 9);
  const coordsList = users.map(getCoords).filter(Boolean);
  if (coordsList.length <= 1) return true;
  if (coordsList.length <= minCountToSkipClustering) return true;
  if (coordsList.length > maxCountForSpreadCheck) return false;

  const bounds = getBounds(coordsList);
  const diagonal = getDiagonalDegrees(bounds);
  return diagonal >= cellSize * spreadCellMultiplier;
};

export const clusterEntitiesByGrid = (
  entities,
  { zoom = 10, cellFactor = 1, policy = {} } = {}
) => {
  const users = Array.isArray(entities) ? entities : [];
  const z = normalizeZoom(zoom, 10);
  if (z >= 15) {
    return {
      clusters: [],
      points: users.filter((u) => getCoords(u) != null),
    };
  }
  const cellSize = cellSizeForZoom(z, cellFactor);
  if (shouldSkipClustering(users, cellSize, policy)) {
    return {
      clusters: [],
      points: users.filter((u) => getCoords(u) != null),
    };
  }
  const groups = new Map();
  for (const user of users) {
    const coords = getCoords(user);
    if (!coords) continue;
    const gx = Math.floor((coords.longitude + 180) / cellSize);
    const gy = Math.floor((coords.latitude + 90) / cellSize);
    const key = `${gx}:${gy}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(user);
  }
  const clusters = [];
  const points = [];
  groups.forEach((members, key) => {
    if (members.length <= 1) {
      points.push(members[0]);
      return;
    }
    let latSum = 0;
    let lngSum = 0;
    const memberIds = [];
    const memberPoints = [];
    const validMembers = [];
    members.forEach((m) => {
      const c = getCoords(m);
      if (!c) return;
      latSum += c.latitude;
      lngSum += c.longitude;
      validMembers.push(c);
      memberPoints.push({
        _id: m?._id != null ? String(m._id) : null,
        latitude: c.latitude,
        longitude: c.longitude,
      });
      if (m?._id != null) memberIds.push(String(m._id));
    });
    const count = validMembers.length;
    if (count <= 1) {
      points.push(members[0]);
      return;
    }
    clusters.push({
      id: `cluster:${z}:${key}`,
      latitude: latSum / count,
      longitude: lngSum / count,
      count,
      memberIds,
      memberPoints,
      bounds: getBounds(validMembers),
    });
  });
  return { clusters, points };
};

