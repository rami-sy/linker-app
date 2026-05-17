import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { useDispatch, useSelector, useStore } from "react-redux";
import debounce from "lodash/debounce";
import {
  finishMapRequest,
  pruneExpiredMapTiles,
  setMapCenter,
  setMapClusters,
  setMapTile,
  setMapViewport,
  setVisibleUserIds,
  startMapRequest,
  upsertMapEntities,
} from "../redux/exploreSlice";
import {
  buildBoundsFromCenter,
  getNativeViewportFromRegion,
  getWebViewportFromEvent,
} from "../utils/map/viewport";
import {
  getTileKeysForBounds,
  isUserInBounds,
  tileKeyToBounds,
} from "../utils/map/tiles";
import { buildWebClusters } from "../utils/map/web-cluster-adapter";
import { buildNativeClusters } from "../utils/map/native-cluster-adapter";

const TILE_TTL_MS = 60 * 1000;
const FETCH_DEBOUNCE_MS = 450;
const WEB_IDLE_FETCH_DELAY_MS = 750;
const MAP_MAX_ZOOM = 20;

const uniq = (arr) => [...new Set(arr)];

export default function useExploreMapData({ socket, user, screenWidth }) {
  const dispatch = useDispatch();
  const store = useStore();
  const {
    mapCenter,
    mapViewport,
    mapTiles,
    mapEntitiesById,
    mapClusters,
    mapUI,
    mapRequest,
  } = useSelector((state) => state.explore);

  const queryVersionRef = useRef(mapRequest.queryVersion || 0);
  const isWeb = Platform.OS === "web";

  const applyVisibilityAndClusters = useCallback(
    (viewport) => {
      if (!viewport?.bounds) return;
      const state = store.getState().explore;
      const tileKeys = getTileKeysForBounds(viewport.bounds, viewport.zoom);
      const now = Date.now();
      const candidateIds = [];

      for (const key of tileKeys) {
        const tile = state.mapTiles[key];
        if (!tile || (tile.expiresAt || 0) < now) continue;
        candidateIds.push(...(tile.ids || []));
      }

      const fallbackIds =
        candidateIds.length > 0
          ? uniq(candidateIds)
          : Object.keys(state.mapEntitiesById || {});

      const visibleIds = fallbackIds.filter((id) =>
        isUserInBounds(state.mapEntitiesById?.[String(id)], viewport.bounds)
      );
      dispatch(setVisibleUserIds(visibleIds));

      const visibleUsers = visibleIds
        .map((id) => state.mapEntitiesById?.[String(id)])
        .filter(Boolean);
      const clusterData = isWeb
        ? buildWebClusters(visibleUsers, viewport.zoom)
        : buildNativeClusters(visibleUsers, viewport.zoom);
      dispatch(setMapClusters(clusterData));
    },
    [dispatch, isWeb, store]
  );

  const requestFreshData = useCallback(
    (viewport) => {
      if (!socket || !viewport?.bounds) return;
      const tileKeys = getTileKeysForBounds(viewport.bounds, viewport.zoom);
      if (!tileKeys.length) return;

      dispatch(pruneExpiredMapTiles(Date.now()));
      applyVisibilityAndClusters(viewport);

      const state = store.getState().explore;
      const now = Date.now();
      const missingOrExpired = tileKeys.filter((key) => {
        const t = state.mapTiles[key];
        return !t || (t.expiresAt || 0) <= now;
      });

      // Reuse cache when all tiles are still warm.
      if (!missingOrExpired.length) return;

      const nextVersion = queryVersionRef.current + 1;
      queryVersionRef.current = nextVersion;
      dispatch(
        startMapRequest({
          queryVersion: nextVersion,
          isInitial: (state.visibleUserIds || []).length === 0,
        })
      );

      const bounds = viewport.bounds;
      const center = viewport.center || {};
      socket.emit(
        "searchUsersByMap",
        {
          bounds,
          zoom: viewport.zoom,
          latitude: center.latitude,
          longitude: center.longitude,
        },
        (res) => {
          if (nextVersion !== queryVersionRef.current) return;
          if (res?.type !== "success") {
            dispatch(
              finishMapRequest({
                queryVersion: nextVersion,
                error: res?.message || "map search failed",
              })
            );
            return;
          }
          const users = Array.isArray(res?.data) ? res.data : [];
          dispatch(upsertMapEntities(users));
          for (const tileKey of missingOrExpired) {
            const tileBounds = tileKeyToBounds(tileKey);
            const tileIds = users
              .filter((u) => isUserInBounds(u, tileBounds))
              .map((u) => String(u._id));
            dispatch(
              setMapTile({
                tileKey,
                ids: uniq(tileIds),
                updatedAt: Date.now(),
                expiresAt: Date.now() + TILE_TTL_MS,
              })
            );
          }
          applyVisibilityAndClusters(viewport);
          dispatch(finishMapRequest({ queryVersion: nextVersion, error: null }));
        }
      );
    },
    [applyVisibilityAndClusters, dispatch, socket, store]
  );

  const requestDebouncedRef = useRef(null);
  const latestRequestFreshDataRef = useRef(requestFreshData);
  const webIdleFetchTimerRef = useRef(null);
  useEffect(() => {
    latestRequestFreshDataRef.current = requestFreshData;
  }, [requestFreshData]);
  if (!requestDebouncedRef.current) {
    requestDebouncedRef.current = debounce(
      (viewport) => latestRequestFreshDataRef.current?.(viewport),
      FETCH_DEBOUNCE_MS
    );
  }

  const applyViewport = useCallback(
    (viewport, options = {}) => {
      if (!viewport) return;
      const withBounds =
        viewport.bounds ||
        buildBoundsFromCenter(
          viewport.center?.latitude || 0,
          viewport.center?.longitude || 0,
          viewport.zoom || 10,
          screenWidth
        );
      const normalized = { ...viewport, bounds: withBounds };
      dispatch(setMapViewport(normalized));
      dispatch(
        setMapCenter({
          ...mapCenter,
          latitude: normalized.center?.latitude ?? mapCenter.latitude,
          longitude: normalized.center?.longitude ?? mapCenter.longitude,
          zoom: normalized.zoom ?? mapCenter.zoom,
        })
      );
      // During active map drag on web, skip expensive recompute to avoid UI churn.
      if (options.recompute !== false) {
        applyVisibilityAndClusters(normalized);
      }
      if (options.fetch !== false) requestDebouncedRef.current?.(normalized);
    },
    [applyVisibilityAndClusters, dispatch, mapCenter, screenWidth, socket]
  );

  const onWebCenterChanged = useCallback(
    (e) => {
      if (e?.type !== "center_changed") return;
      if (webIdleFetchTimerRef.current) {
        clearTimeout(webIdleFetchTimerRef.current);
        webIdleFetchTimerRef.current = null;
      }
      const vp = getWebViewportFromEvent(e, mapViewport);
      // During drag, only update viewport state. Recompute/fetch on idle.
      applyViewport(vp, { fetch: false, recompute: false });
    },
    [applyViewport, mapViewport]
  );

  const onWebIdle = useCallback(
    (e) => {
      const vp = getWebViewportFromEvent(e, mapViewport) || {
        center: mapViewport.center,
        zoom: mapViewport.zoom,
        bounds: mapViewport.bounds,
        platform: "web",
      };
      // Recompute locally on idle, and delay remote fetch a little for smoother UX.
      applyViewport(vp, { fetch: false, recompute: true });
      if (webIdleFetchTimerRef.current) {
        clearTimeout(webIdleFetchTimerRef.current);
      }
      webIdleFetchTimerRef.current = setTimeout(() => {
        latestRequestFreshDataRef.current?.(vp);
      }, WEB_IDLE_FETCH_DELAY_MS);
    },
    [applyViewport, mapViewport]
  );

  const onNativeRegionChangeComplete = useCallback(
    (region) => {
      const vp = getNativeViewportFromRegion(region, screenWidth);
      applyViewport(vp, { fetch: true });
    },
    [applyViewport, screenWidth]
  );

  const relocateToUser = useCallback(() => {
    const lat = user?.location?.coordinates?.[1];
    const lng = user?.location?.coordinates?.[0];
    if (lat == null || lng == null) return;
    applyViewport(
      {
        center: { latitude: Number(lat), longitude: Number(lng) },
        zoom: mapCenter.zoom || 10,
        bounds: null,
        platform: isWeb ? "web" : "native",
      },
      { fetch: true }
    );
  }, [applyViewport, isWeb, mapCenter.zoom, user?.location?.coordinates]);

  const focusAt = useCallback(
    (latitude, longitude, zoom = mapCenter.zoom || 10) => {
      applyViewport(
        {
          center: { latitude: Number(latitude), longitude: Number(longitude) },
          zoom: Math.min(MAP_MAX_ZOOM, Number(zoom) || 10),
          bounds: null,
          platform: isWeb ? "web" : "native",
        },
        { fetch: true }
      );
    },
    [applyViewport, isWeb, mapCenter.zoom]
  );

  const getClusterExpandTarget = useCallback(
    (cluster, zoomStep = 2) => {
      if (!cluster) return null;
      const members = Array.isArray(cluster.memberPoints)
        ? cluster.memberPoints.filter(
            (p) =>
              Number.isFinite(Number(p?.latitude)) &&
              Number.isFinite(Number(p?.longitude))
          )
        : [];
      const fallbackBounds = cluster?.bounds || null;
      let bounds = fallbackBounds;
      if (!bounds && members.length) {
        let north = -90;
        let south = 90;
        let east = -180;
        let west = 180;
        for (const p of members) {
          const lat = Number(p.latitude);
          const lng = Number(p.longitude);
          if (lat > north) north = lat;
          if (lat < south) south = lat;
          if (lng > east) east = lng;
          if (lng < west) west = lng;
        }
        bounds = { north, south, east, west };
      }
      const currentZoom = Number(mapViewport?.zoom || mapCenter.zoom || 10);
      return {
        bounds,
        targetZoom: Math.min(MAP_MAX_ZOOM, currentZoom + Number(zoomStep || 0)),
        currentZoom,
      };
    },
    [mapCenter.zoom, mapViewport?.zoom]
  );

  useEffect(() => {
    return () => {
      requestDebouncedRef.current?.cancel?.();
      if (webIdleFetchTimerRef.current) {
        clearTimeout(webIdleFetchTimerRef.current);
        webIdleFetchTimerRef.current = null;
      }
    };
  }, []);

  const initialRegion = useMemo(
    () => ({
      latitude: mapCenter.latitude || user?.location?.coordinates?.[1] || 0,
      longitude: mapCenter.longitude || user?.location?.coordinates?.[0] || 0,
      zoom: mapCenter.zoom || 10,
      latitudeDelta: mapCenter.latitudeDelta || 0.0922,
      longitudeDelta: mapCenter.longitudeDelta || 0.0421,
    }),
    [mapCenter, user?.location?.coordinates]
  );

  useEffect(() => {
    if (!user?.location?.coordinates || mapCenter.firstInit) return;
    const lat = Number(user.location.coordinates[1] || 0);
    const lng = Number(user.location.coordinates[0] || 0);
    applyViewport(
      {
        center: { latitude: lat, longitude: lng },
        zoom: mapCenter.zoom || 10,
        bounds: null,
        platform: isWeb ? "web" : "native",
      },
      { fetch: true }
    );
    dispatch(setMapCenter({ ...mapCenter, latitude: lat, longitude: lng, firstInit: true }));
  }, [applyViewport, dispatch, isWeb, mapCenter, user?.location?.coordinates]);

  return {
    initialRegion,
    onWebCenterChanged,
    onWebIdle,
    onNativeRegionChangeComplete,
    relocateToUser,
    focusAt,
    clusters: mapClusters.clusters || [],
    points: mapClusters.points || [],
    isInitialLoading: mapUI.isInitialLoading,
    isRefreshingBackground: mapUI.isRefreshingBackground,
    mapViewport,
    mapEntitiesById,
    mapMaxZoom: MAP_MAX_ZOOM,
    getClusterExpandTarget,
  };
}

