import { createSlice } from "@reduxjs/toolkit";

export const exploreSlice = createSlice({
  name: "explore",
  initialState: {
    exploreUsers: [],
    exploreUsersSwiper: [],
    page: 1,
    pageSwiper: 0,
    firstLoad: false,
    firstLoadSwiper: true,
    scrollOffset: 0,
    hasMore: true,
    hasMoreSwiper: true,
    sortBy: "recommended",
    loading: false,
    loadingSwiper: false,
    refreshing: false,
    mapCenter: {
      latitude: 0,
      longitude: 0,
      zoom: 10,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
      firstInit: false,
    },
    mapViewport: {
      center: { latitude: 0, longitude: 0 },
      zoom: 10,
      bounds: null, // { north, south, east, west }
      platform: null, // "web" | "native"
    },
    mapEntitiesById: {},
    mapTiles: {}, // { [tileKey]: { ids: string[], expiresAt: number, updatedAt: number } }
    visibleUserIds: [],
    mapClusters: {
      clusters: [], // [{ id, latitude, longitude, count, memberIds }]
      points: [], // user entities that are not clustered
    },
    mapRequest: {
      queryVersion: 0,
      inFlight: false,
      lastAppliedVersion: 0,
    },
    mapUI: {
      isInitialLoading: false,
      isRefreshingBackground: false,
      lastError: null,
    },
    exploreMapUsers: [],
    activeTab: "explore",
    changeFilter: false,
  },
  reducers: {
    setExploreUsers: (state, action) => {
      state.exploreUsers = action.payload;
    },
    setExploreUsersSwiper: (state, action) => {
      state.exploreUsersSwiper = action.payload;
    },
    setPage: (state, action) => {
      state.page = action.payload;
    },
    setPageSwiper: (state, action) => {
      state.pageSwiper = action.payload;
    },
    setFirstLoad: (state, action) => {
      state.firstLoad = action.payload;
    },
    setScrollOffset: (state, action) => {
      state.scrollOffset = action.payload;
    },
    setHasMore: (state, action) => {
      state.hasMore = action.payload;
    },
    setHasMoreSwiper: (state, action) => {
      state.hasMoreSwiper = action.payload;
    },
    setSortBy: (state, action) => {
      state.sortBy = action.payload;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setLoadingSwiper: (state, action) => {
      state.loadingSwiper = action.payload;
    },
    setRefreshing: (state, action) => {
      state.refreshing = action.payload;
    },
    setFirstLoadSwiper: (state, action) => {
      state.firstLoadSwiper = action.payload;
    },
    setMapCenter: (state, action) => {
      state.mapCenter = action.payload;
      const latitude = action.payload?.latitude ?? 0;
      const longitude = action.payload?.longitude ?? 0;
      const zoom = action.payload?.zoom ?? state.mapViewport.zoom ?? 10;
      state.mapViewport = {
        ...state.mapViewport,
        center: { latitude, longitude },
        zoom,
      };
    },
    setMapViewport: (state, action) => {
      const payload = action.payload || {};
      state.mapViewport = {
        ...state.mapViewport,
        ...payload,
      };
    },
    upsertMapEntities: (state, action) => {
      const users = Array.isArray(action.payload) ? action.payload : [];
      for (const user of users) {
        const id = user?._id != null ? String(user._id) : null;
        if (!id) continue;
        state.mapEntitiesById[id] = {
          ...(state.mapEntitiesById[id] || {}),
          ...user,
        };
      }
    },
    setMapTile: (state, action) => {
      const { tileKey, ids, expiresAt, updatedAt } = action.payload || {};
      if (!tileKey) return;
      state.mapTiles[tileKey] = {
        ids: Array.isArray(ids) ? ids.map((id) => String(id)) : [],
        expiresAt: Number(expiresAt) || Date.now(),
        updatedAt: Number(updatedAt) || Date.now(),
      };
    },
    pruneExpiredMapTiles: (state, action) => {
      const now = Number(action.payload) || Date.now();
      const nextTiles = {};
      for (const [key, tile] of Object.entries(state.mapTiles || {})) {
        if ((tile?.expiresAt || 0) > now) nextTiles[key] = tile;
      }
      state.mapTiles = nextTiles;
    },
    setVisibleUserIds: (state, action) => {
      const ids = Array.isArray(action.payload) ? action.payload : [];
      state.visibleUserIds = ids.map((id) => String(id));
      state.exploreMapUsers = state.visibleUserIds
        .map((id) => state.mapEntitiesById[id])
        .filter(Boolean);
    },
    setMapClusters: (state, action) => {
      state.mapClusters = {
        clusters: Array.isArray(action.payload?.clusters)
          ? action.payload.clusters
          : [],
        points: Array.isArray(action.payload?.points)
          ? action.payload.points
          : [],
      };
    },
    startMapRequest: (state, action) => {
      const queryVersion = Number(action.payload?.queryVersion) || 0;
      const isInitial = !!action.payload?.isInitial;
      state.mapRequest = {
        ...state.mapRequest,
        queryVersion,
        inFlight: true,
      };
      if (isInitial || !state.mapRequest.lastAppliedVersion) {
        state.mapUI.isInitialLoading = true;
      } else {
        state.mapUI.isRefreshingBackground = true;
      }
      state.mapUI.lastError = null;
      state.loading = true;
    },
    finishMapRequest: (state, action) => {
      const queryVersion = Number(action.payload?.queryVersion) || 0;
      const error = action.payload?.error || null;
      state.mapRequest.inFlight = false;
      state.mapRequest.lastAppliedVersion = Math.max(
        state.mapRequest.lastAppliedVersion || 0,
        queryVersion
      );
      state.mapUI.isInitialLoading = false;
      state.mapUI.isRefreshingBackground = false;
      state.mapUI.lastError = error;
      state.loading = false;
    },
    clearMapData: (state) => {
      state.mapEntitiesById = {};
      state.mapTiles = {};
      state.visibleUserIds = [];
      state.mapClusters = { clusters: [], points: [] };
      state.exploreMapUsers = [];
      state.mapRequest = {
        queryVersion: 0,
        inFlight: false,
        lastAppliedVersion: 0,
      };
      state.mapUI = {
        isInitialLoading: false,
        isRefreshingBackground: false,
        lastError: null,
      };
      state.loading = false;
    },
    setExploreMapUsers: (state, action) => {
      const users = Array.isArray(action.payload) ? action.payload : [];
      state.exploreMapUsers = users;
      const visibleIds = [];
      for (const user of users) {
        const id = user?._id != null ? String(user._id) : null;
        if (!id) continue;
        state.mapEntitiesById[id] = {
          ...(state.mapEntitiesById[id] || {}),
          ...user,
        };
        visibleIds.push(id);
      }
      state.visibleUserIds = visibleIds;
    },
    setActiveTab: (state, action) => {
      state.activeTab = action.payload;
    },
    setChangeFilter: (state, action) => {
      state.changeFilter = action.payload;
    },
  },
});

export const {
  setExploreUsers,
  setExploreUsersSwiper,
  setPage,
  setPageSwiper,
  setFirstLoad,
  setScrollOffset,
  setHasMore,
  setHasMoreSwiper,
  setSortBy,
  setLoading,
  setLoadingSwiper,
  setRefreshing,
  setFirstLoadSwiper,
  setMapCenter,
  setMapViewport,
  upsertMapEntities,
  setMapTile,
  pruneExpiredMapTiles,
  setVisibleUserIds,
  setMapClusters,
  startMapRequest,
  finishMapRequest,
  clearMapData,
  setExploreMapUsers,
  setActiveTab,
  setChangeFilter,
} = exploreSlice.actions;

export const selectExplore = (state) => state.explore;
export const selectMapVisibleUsers = (state) => {
  const explore = state.explore;
  return (explore.visibleUserIds || [])
    .map((id) => explore.mapEntitiesById?.[String(id)])
    .filter(Boolean);
};

export default exploreSlice.reducer;
