import React, { useEffect } from "react";
import { Platform } from "react-native";

// Conditional imports based on the platform
const isWeb = Platform.OS === "web";
let MapView, Marker;
if (isWeb) {
  var {
    APIProvider,
    Map,
    Marker: WebMarker,
    AdvancedMarker,
    useMap,
  } = require("@vis.gl/react-google-maps");
} else {
  MapView = require("react-native-maps").default;
  Marker = require("react-native-maps").Marker;
}

// Dark theme styles for the map
const darkThemeStyles = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "administrative.country",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9e9e9e" }],
  },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#bdbdbd" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#181818" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#1b1b1b" }],
  },
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: "#2c2c2c" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8a8a8a" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#373737" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3c3c3c" }],
  },
  {
    featureType: "road.highway.controlled_access",
    elementType: "geometry",
    stylers: [{ color: "#4e4e4e" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    featureType: "transit",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#000000" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3d3d3d" }],
  },
];

const isValidCoordinate = (coordinate) => {
  return (
    coordinate &&
    typeof coordinate.latitude === "number" &&
    !isNaN(coordinate.latitude) &&
    typeof coordinate.longitude === "number" &&
    !isNaN(coordinate.longitude)
  );
};

const setWebMapRef = (mapRef, map) => {
  if (!mapRef) return;
  if (!map) {
    mapRef.current = null;
    return;
  }
  mapRef.current = {
    raw: map,
    setCamera: ({ latitude, longitude, zoom }) => {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const z = Number(zoom);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        map.panTo({ lat, lng });
      }
      if (!Number.isNaN(z)) {
        map.setZoom(z);
      }
    },
    fitBounds: (bounds, opts = {}) => {
      const north = Number(bounds?.north);
      const south = Number(bounds?.south);
      const east = Number(bounds?.east);
      const west = Number(bounds?.west);
      if (
        [north, south, east, west].some((v) => Number.isNaN(v)) ||
        !globalThis?.google?.maps?.LatLngBounds
      ) {
        return false;
      }
      const latLngBounds = new globalThis.google.maps.LatLngBounds(
        { lat: south, lng: west },
        { lat: north, lng: east }
      );
      map.fitBounds(latLngBounds, Number(opts.padding ?? 72));
      const maxZoom = Number(opts.maxZoom);
      if (!Number.isNaN(maxZoom)) {
        const current = Number(map.getZoom());
        if (!Number.isNaN(current) && current > maxZoom) {
          map.setZoom(maxZoom);
        }
      }
      return true;
    },
    getZoom: () => Number(map.getZoom()),
  };
};

const WebMapBridge = ({ mapRef }) => {
  if (!isWeb) return null;
  const map = useMap();
  useEffect(() => {
    if (!mapRef) return undefined;
    setWebMapRef(mapRef, map);
    return () => setWebMapRef(mapRef, null);
  }, [map, mapRef]);
  return null;
};

const WebMapComponent = ({
  children,
  style,
  initialRegion,
  onCenterChanged,
  onIdle,
  mapRef,
}) => {
  const rightCenterPosition =
    globalThis?.google?.maps?.ControlPosition?.RIGHT_CENTER ?? 8;

  return (
    <APIProvider
      apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
      libraries={["marker"]}
    >
      <Map
        defaultCenter={{
          lat: initialRegion.latitude,
          lng: initialRegion.longitude,
        }}
        mapId={"bf51a910020fa25a"}
        defaultZoom={initialRegion.zoom || 10} // Set default zoom level
        style={style}
        options={{
          styles: darkThemeStyles,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          // Use camera control at right-center to avoid bottom overlap with app nav.
          cameraControl: true,
          cameraControlOptions: {
            position: rightCenterPosition,
          },
          // Disable legacy zoom control to avoid duplicate + / - controls.
          zoomControl: false,
          maxZoom: 60, // Set the maximum zoom level
          minZoom: 5, // Set the minimum zoom level
        }}
        onCenterChanged={onCenterChanged}
        onIdle={onIdle}
      >
        <WebMapBridge mapRef={mapRef} />
        {children}
      </Map>
    </APIProvider>
  );
};

const NativeMapComponent = ({
  children,
  style,
  initialRegion,
  onCenterChanged,
  mapRef,
}) => (
  <MapView
    ref={(el) => {
      if (!mapRef) return;
      if (!el) {
        mapRef.current = null;
        return;
      }
      mapRef.current = {
        raw: el,
        setCamera: ({ latitude, longitude, zoom }) => {
          const lat = Number(latitude);
          const lng = Number(longitude);
          const z = Number(zoom);
          const longitudeDelta = Math.max(
            0.0005,
            360 / Math.pow(2, Number.isNaN(z) ? 10 : z)
          );
          const latitudeDelta = Math.max(0.0005, longitudeDelta * 0.6);
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            el.animateToRegion(
              {
                latitude: lat,
                longitude: lng,
                latitudeDelta,
                longitudeDelta,
              },
              320
            );
          }
        },
        fitBounds: (bounds, opts = {}) => {
          const north = Number(bounds?.north);
          const south = Number(bounds?.south);
          const east = Number(bounds?.east);
          const west = Number(bounds?.west);
          if ([north, south, east, west].some((v) => Number.isNaN(v))) return;
          const padding = Number(opts.padding ?? 72);
          if (typeof el.fitToCoordinates === "function") {
            el.fitToCoordinates(
              [
                { latitude: north, longitude: east },
                { latitude: south, longitude: west },
              ],
              {
                edgePadding: {
                  top: padding,
                  right: padding,
                  bottom: padding,
                  left: padding,
                },
                animated: true,
              }
            );
          }
        },
      };
    }}
    style={style}
    initialRegion={initialRegion}
    provider={MapView.PROVIDER_GOOGLE}
    customMapStyle={darkThemeStyles}
    onRegionChangeComplete={onCenterChanged}
  >
    {children}
  </MapView>
);

// Custom Map Component
const CustomMap = ({
  children,
  style,
  initialRegion,
  onCenterChanged,
  onIdle,
  mapRef,
}) => {
  if (!isValidCoordinate(initialRegion)) {
    return null; // أو عرض رسالة خطأ أو مؤشر تحميل
  }

  return isWeb ? (
    <WebMapComponent
      mapRef={mapRef}
      // key={`${region.latitude}-${region.longitude}`} // يجبر التحديث في الويب
      style={style}
      initialRegion={initialRegion}
      onCenterChanged={onCenterChanged}
      onIdle={onIdle}
      children={children}
    />
  ) : (
    <NativeMapComponent
      mapRef={mapRef}
      style={style}
      initialRegion={initialRegion}
      onCenterChanged={onCenterChanged}
      children={children}
      minZoomLevel={5} // السماح بالزوم أوت حتى مستوى 2
      maxZoomLevel={60} // يمكن ضبط الحد الأقصى للزوم إذا لزم الأمر
    />
  );
};

const MarkerWeb = ({ position, title, description, children, onPress }) => (
  <AdvancedMarker
    position={{ lat: position?.latitude, lng: position?.longitude }}
    title={title}
    clickable
    gmpClickable
    style={{
      color: "white",
      padding: "4px 8px",
      borderRadius: "4px",
    }}
    onClick={onPress}
  >
    {children}
  </AdvancedMarker>
);

const MarkerNative = ({ position, title, description, children, onPress }) => (
  <Marker
    coordinate={{
      latitude: position?.latitude,
      longitude: position?.longitude,
    }}
    title={title}
    description={description}
    onPress={onPress}
  >
    {children}
  </Marker>
);

// Custom Marker Component
const CustomMarker = ({ position, title, description, children, onPress }) => {
  if (!isValidCoordinate(position)) {
    return null; // أو عرض رسالة خطأ أو مؤشر تحميل
  }

  return isWeb ? (
    <MarkerWeb
      position={position}
      title={title}
      description={description}
      children={children}
      onPress={onPress}
    />
  ) : (
    <MarkerNative
      position={position}
      title={title}
      description={description}
      children={children}
      onPress={onPress}
    />
  );
};

export { CustomMap, CustomMarker };
