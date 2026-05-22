import {
  View,
  TouchableOpacity,
  Text,
  Platform,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import React, { useCallback, useContext, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useColorScheme } from "~/lib/useColorScheme";
import UserImage from "../../../../../src/components/user-image";
import { ProfileUserCard, UserDisplay } from "../../../../../src/components/user";
import {
  CustomMap,
  CustomMarker,
} from "../../../../../src/lib/web-google-maps";
import { router, useSegments } from "expo-router";
import { SocketContext } from "../../../../../src/contexts/socket.context";
import calculateDistance from "../../../../../src/utils/calculateDistance";
import FeIcon from "react-native-vector-icons/Feather";
import MCIcon from "react-native-vector-icons/MaterialCommunityIcons";
import { setActiveTab } from "../../../../../src/redux/exploreSlice";
import Popup from "../../../../../src/components/popup";
import { setUserProfile } from "../../../../../src/redux/userSlice";
import Head from "expo-router/head";
import ExploreModeTabs from "../../../../../src/components/navigation/explore-mode-tabs";
import { getNavPalette } from "../../../../../src/components/navigation/nav-theme";
import useExploreMapData from "../../../../../src/hooks/useExploreMapData";

const AddFriendMap = () => {
  const { user } = useSelector((state) => state.users);
  const { socket, emitWithAck } = useContext(SocketContext);
  const screenWidth = Dimensions.get("window").width;

  const dispatch = useDispatch();
  const { isDarkColorScheme } = useColorScheme();
  const navPalette = getNavPalette(isDarkColorScheme);
  const segments = useSegments();
  const isWeb = Platform.OS === "web";
  const mapRef = useRef(null);

  const {
    initialRegion,
    onWebCenterChanged,
    onWebIdle,
    onNativeRegionChangeComplete,
    relocateToUser,
    clusters,
    points,
    isInitialLoading,
    isRefreshingBackground,
    mapEntitiesById,
    mapViewport,
  } = useExploreMapData({
    socket,
    user,
    screenWidth,
  });

  const openUserCard = async (targetUserId) => {
    if (!socket || !targetUserId) return;
    const res = await emitWithAck("getOneUser", {
      targetUserId,
    });
    if (res?.data) {
      dispatch(setUserProfile(res.data));
      setShowUserCard(true);
    }
  };

  const handleRelocate = () => {
    relocateToUser();
    if (!isWeb && mapRef?.current?.setCamera && user?.location?.coordinates?.[1]) {
      mapRef.current.setCamera({
        latitude: user.location.coordinates[1],
        longitude: user.location.coordinates[0],
        zoom: mapViewport?.zoom || 12,
      });
    }
  };
  const [showUserCard, setShowUserCard] = useState(false);
  const [expandedClusterId, setExpandedClusterId] = useState(null);
  const [expandedClusterNodes, setExpandedClusterNodes] = useState([]);

  const clearExpandedCluster = useCallback(() => {
    setExpandedClusterId(null);
    setExpandedClusterNodes([]);
  }, []);

  const onMapCenterChanged = useCallback(
    (e) => {
      clearExpandedCluster();
      if (Platform.OS === "web") {
        onWebCenterChanged(e);
      } else {
        onNativeRegionChangeComplete(e);
      }
    },
    [clearExpandedCluster, onNativeRegionChangeComplete, onWebCenterChanged]
  );

  const onMapIdle = useCallback(
    (e) => {
      clearExpandedCluster();
      if (Platform.OS === "web") onWebIdle(e);
    },
    [clearExpandedCluster, onWebIdle]
  );

  const clusterMembersAsUsers = useCallback(
    (cluster) => {
      const ids = Array.isArray(cluster?.memberIds) ? cluster.memberIds : [];
      const byIdUsers = ids
        .map((id) => mapEntitiesById?.[String(id)])
        .filter(Boolean)
        .map((u) => ({
          _id: u?._id,
          user: u,
          latitude: Number(u?.location?.coordinates?.[1]),
          longitude: Number(u?.location?.coordinates?.[0]),
        }))
        .filter((u) => Number.isFinite(u.latitude) && Number.isFinite(u.longitude));
      if (byIdUsers.length) return byIdUsers;

      const memberPoints = Array.isArray(cluster?.memberPoints) ? cluster.memberPoints : [];
      return memberPoints
        .map((p) => {
          const id = p?._id != null ? String(p._id) : null;
          return {
            _id: id,
            user: id ? mapEntitiesById?.[id] : null,
            latitude: Number(p?.latitude),
            longitude: Number(p?.longitude),
          };
        })
        .filter((u) => Number.isFinite(u.latitude) && Number.isFinite(u.longitude));
    },
    [mapEntitiesById]
  );

  const handleClusterPress = useCallback(
    (cluster) => {
      if (!cluster) return;
      if (expandedClusterId === cluster.id) {
        clearExpandedCluster();
        return;
      }
      const members = clusterMembersAsUsers(cluster);
      setExpandedClusterId(cluster.id);
      setExpandedClusterNodes(members);
    },
    [
      clearExpandedCluster,
      clusterMembersAsUsers,
      expandedClusterId,
    ]
  );

  const renderedPoints = useMemo(() => {
    if (!expandedClusterNodes.length) return points;
    const hiddenIds = new Set(expandedClusterNodes.map((n) => String(n?._id)).filter(Boolean));
    return points.filter((p) => !hiddenIds.has(String(p?._id)));
  }, [expandedClusterNodes, points]);
  const exploreModeItems = [
    {
      name: "explore",
      active: segments[4] === "explore",
      icon: (
        <FeIcon
          name="list"
          size={25}
          color={
            segments[4] === "explore"
              ? navPalette.activeTint
              : navPalette.inactiveTint
          }
        />
      ),
      onPress: () => {
        router.push({ pathname: "/explore" });
        dispatch(setActiveTab("explore"));
      },
    },
    {
      name: "explore-map",
      active: segments[4] === "explore-map",
      icon: (
        <FeIcon
          name="map-pin"
          size={25}
          color={
            segments[4] === "explore-map"
              ? navPalette.activeTint
              : navPalette.inactiveTint
          }
        />
      ),
      onPress: () => {
        router.push({ pathname: "/explore-map" });
        dispatch(setActiveTab("explore-map"));
      },
    },
    {
      name: "swiper",
      active: segments[4] === "swiper",
      icon: (
        <MCIcon
          name="gesture-swipe"
          size={25}
          color={
            segments[4] === "swiper"
              ? navPalette.activeTint
              : navPalette.inactiveTint
          }
        />
      ),
      onPress: () => {
        router.push({ pathname: "/swiper" });
        dispatch(setActiveTab("swiper"));
      },
    },
  ];

  return (
    <>
      <Head>
        <title>Explore Nearby People | Linker</title>
        <meta
          name="description"
          content="Find exciting new places and events near you. Meet new people and explore popular locations with Linker."
        />
      </Head>
      <Popup
        showModal={showUserCard}
        onCancel={() => setShowUserCard(false)}
        withActions={false}
        w="w-11/12"
        maxDialogWidth={500}
        minDialogWidth={300}
        dialogWidthFraction={0.92}
      >
        <ProfileUserCard
          inPopup
          backButton={false}
          onImagePress={() => {}}
          w="w-full"
          onCancel={() => setShowUserCard(false)}
          viewProfile={true}
          viewProfileFrom="explore-map"
        />
      </Popup>
      <View
        className="flex-1 w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
      >
        <ExploreModeTabs
          isDarkColorScheme={isDarkColorScheme}
          items={exploreModeItems}
          rightContent={
            isInitialLoading || isRefreshingBackground ? (
              <View className="flex-row items-center justify-center px-3">
                <ActivityIndicator
                  size="small"
                  color={isDarkColorScheme ? "#dee4e6" : "#012a4a"}
                />
              </View>
            ) : null
          }
        />
        <View className="flex-1">
          <View style={{ flex: 1 }} className={`flex-1 pb-0`}>
            {user?.location && (
              <>
                <CustomMap
                  mapRef={mapRef}
                  style={{ flex: 1 }}
                  initialRegion={initialRegion}
                  customMapStyle={mapDarkStyle} // Apply your dark mode style here
                  onCenterChanged={onMapCenterChanged}
                  onIdle={Platform.OS === "web" ? onMapIdle : undefined}
                >
                  <CustomMarker
                    position={{
                      latitude: user?.location?.coordinates?.[1],
                      longitude: user?.location?.coordinates?.[0],
                    }}
                  >
                    <UserImage user={user} size="h-10 w-10" border="border-2" />
                  </CustomMarker>
                  {clusters
                    .filter((cluster) => cluster.id !== expandedClusterId)
                    .map((cluster) => (
                    <CustomMarker
                      key={cluster.id}
                      position={{
                        latitude: cluster.latitude,
                        longitude: cluster.longitude,
                      }}
                      onPress={() => handleClusterPress(cluster)}
                    >
                      <TouchableOpacity
                        className="h-12 min-w-[48px] px-3 rounded-full border-2 border-slate-900 bg-emerald-900 items-center justify-center"
                        activeOpacity={0.85}
                        onPress={() => handleClusterPress(cluster)}
                      >
                        <Text className="text-sm font-bold text-papaya">
                          {cluster.count}
                        </Text>
                      </TouchableOpacity>
                    </CustomMarker>
                  ))}
                  {renderedPoints.map((item) => {
                    const distance = calculateDistance(
                      user?.location?.coordinates?.[1], // Main user latitude
                      user?.location?.coordinates?.[0], // Main user longitude
                      item?.location?.coordinates?.[1],
                      item?.location?.coordinates?.[0]
                    );

                    return (
                      <CustomMarker
                        key={item?._id}
                        position={{
                          latitude: item?.location?.coordinates?.[1],
                          longitude: item?.location?.coordinates?.[0],
                        }}
                        onPress={() => openUserCard(item?._id)}
                      >
                        <TouchableOpacity
                          className={`flex flex-row items-center justify-center pr-3 rounded-full bg-emerald-900 border-2 border-slate-900`}
                          onPress={() => openUserCard(item?._id)}
                        >
                          <UserDisplay
                            user={item}
                            imageSize="h-12 w-12"
                            imageBorder="border-0"
                            imageStatusColor="bg-slate-400"
                            onlyFirst
                            secondaryText={`${distance.toFixed(0)} km`}
                            primaryClassName="text-sm font-semibold !text-papaya"
                            secondaryClassName="!text-papaya text-sm"
                          />
                        </TouchableOpacity>
                      </CustomMarker>
                    );
                  })}
                  {expandedClusterNodes.map((node) => {
                    const targetUser = node?.user || mapEntitiesById?.[String(node?._id)] || null;
                    const distance = calculateDistance(
                      user?.location?.coordinates?.[1],
                      user?.location?.coordinates?.[0],
                      node?.latitude,
                      node?.longitude
                    );
                    return (
                      <CustomMarker
                        key={`expanded:${node?._id}:${node.latitude}:${node.longitude}`}
                        position={{
                          latitude: node?.latitude,
                          longitude: node?.longitude,
                        }}
                        onPress={() => openUserCard(targetUser?._id || node?._id)}
                      >
                        <TouchableOpacity
                          className={`flex flex-row items-center justify-center pr-3 rounded-full bg-emerald-900 border-2 border-slate-900`}
                          onPress={() => openUserCard(targetUser?._id || node?._id)}
                        >
                          <UserDisplay
                            user={targetUser}
                            imageSize="h-12 w-12"
                            imageBorder="border-0"
                            imageStatusColor="bg-slate-400"
                            onlyFirst
                            secondaryText={`${distance.toFixed(0)} km`}
                            primaryClassName="text-sm font-semibold !text-papaya"
                            secondaryClassName="!text-papaya text-sm"
                          />
                        </TouchableOpacity>
                      </CustomMarker>
                    );
                  })}
                </CustomMap>

                <TouchableOpacity
                  onPress={handleRelocate}
                  className="absolute flex items-center justify-center w-12 h-12 rounded-full shadow-lg top-3 right-3 bg-emerald-600"
                >
                  <FeIcon name="navigation" size={24} color="white" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </>
  );
};

const mapDarkStyle = [
  {
    elementType: "geometry",
    stylers: [
      {
        color: "#242f3e",
      },
    ],
  },
  {
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#746855",
      },
    ],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [
      {
        color: "#242f3e",
      },
    ],
  },
  {
    featureType: "administrative",
    stylers: [
      {
        visibility: "simplified",
      },
    ],
  },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "administrative.locality",
    elementType: "geometry",
    stylers: [
      {
        visibility: "simplified",
      },
    ],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#d59563",
      },
    ],
  },
  {
    featureType: "administrative.neighborhood",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "geometry.fill",
    stylers: [
      {
        visibility: "simplified",
      },
    ],
  },
  {
    featureType: "poi",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "poi",
    elementType: "labels.text",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#d59563",
      },
    ],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [
      {
        color: "#263c3f",
      },
    ],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#6b9a76",
      },
    ],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [
      {
        color: "#38414e",
      },
    ],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [
      {
        color: "#212a37",
      },
    ],
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#9ca5b3",
      },
    ],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [
      {
        visibility: "simplified",
      },
    ],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [
      {
        color: "#746855",
      },
    ],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [
      {
        color: "#1f2835",
      },
    ],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#f3d19c",
      },
    ],
  },
  {
    featureType: "road.local",
    stylers: [
      {
        visibility: "simplified",
      },
    ],
  },
  {
    featureType: "road.local",
    elementType: "geometry",
    stylers: [
      {
        visibility: "simplified",
      },
    ],
  },
  {
    featureType: "road.local",
    elementType: "geometry.fill",
    stylers: [
      {
        visibility: "simplified",
      },
      {
        weight: 1,
      },
    ],
  },
  {
    featureType: "road.local",
    elementType: "geometry.stroke",
    stylers: [
      {
        visibility: "simplified",
      },
    ],
  },
  {
    featureType: "road.local",
    elementType: "labels",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "road.local",
    elementType: "labels.icon",
    stylers: [
      {
        color: "#d5eaec",
      },
      {
        saturation: 25,
      },
      {
        lightness: 30,
      },
      {
        visibility: "off",
      },
      {
        weight: 3.5,
      },
    ],
  },
  {
    featureType: "transit",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [
      {
        color: "#2f3948",
      },
    ],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#d59563",
      },
    ],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [
      {
        color: "#17263c",
      },
    ],
  },
  {
    featureType: "water",
    elementType: "labels.text",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#515c6d",
      },
    ],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [
      {
        color: "#17263c",
      },
    ],
  },
];
export default AddFriendMap;
