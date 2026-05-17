import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import * as Location from "expo-location";

import { CustomMap, CustomMarker } from "../../lib/web-google-maps";
import FeIcon from "react-native-vector-icons/Feather";
import Geocoder from "react-native-geocoding";
import IconButton from "../icon-button";
import MDIcon from "react-native-vector-icons/MaterialIcons";
import { useColorScheme } from "../../../lib/useColorScheme";

const LocationPicker = ({ setShowLocationPicker, marker, setMarker }) => {
  const [region, setRegion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState("");
  const [accuracy, setAccuracy] = useState(Location.Accuracy.High);

  Geocoder.init(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

  const requestLocation = async () => {
    setLoading(true);
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      console.error("Location permission not granted");
      setLoading(false);
      return;
    }

    let location = await Location.getCurrentPositionAsync({ accuracy });
    if (location && location.coords) {
      const { latitude, longitude } = location.coords;

      if (typeof latitude === "number" && typeof longitude === "number") {
        setRegion({
          latitude,
          longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.0121,
        });

        setMarker({
          latitude,
          longitude,
        });

        fetchAddress(latitude, longitude);
      }
    }
    setLoading(false);
  };

  const fetchAddress = async (latitude, longitude) => {
    try {
      let response = await Geocoder.from(latitude, longitude);
      let address = response.results[0].formatted_address;
      setAddress(address);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    requestLocation();
  }, []);

  const handlePress = (e) => {
    const { coordinate } = e.nativeEvent;
    setMarker(coordinate);
    fetchAddress(coordinate.latitude, coordinate.longitude);
  };

  const handleRefresh = () => {
    setMarker(null);
    setAddress("");
    requestLocation();
  };
  const { isDarkColorScheme } = useColorScheme();
  return (
    <View
      className={`h-full w-full justify-center items-center absolute left-0 right-0 bottom-0 top-[-2px] bg-main`}
    >
      <View
        className={`absolute top-0 left-0 right-0 z-10 flex flex-row items-center justify-between w-full p-3`}
      >
        <IconButton
          onPress={() => {
            setShowLocationPicker(false);
            setMarker(null);
          }}
          iconName="close"
          iconComponent={MDIcon}
        />
        <IconButton
          onPress={handleRefresh}
          iconName="refresh-cw"
          iconComponent={FeIcon}
        />
      </View>
      {loading ? (
        <View
          className="absolute top-0 left-0 z-10 items-center justify-center flex-1 w-full h-full bg-[#f6f8f9] dark:bg-main"
        >
          <ActivityIndicator
            size="large"
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        </View>
      ) : (
        <>
          <CustomMap
            style={styles.map}
            initialRegion={region}
            onPress={handlePress}
          >
            {marker && <CustomMarker position={marker} />}
          </CustomMap>
          {/* {address && (
            <View className={`absolute top-4 bg-sec w-11/12 p-3 rounded-2xl`}>
              <Text className={`text-papaya`}>{address}</Text>
            </View>
          )} */}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default LocationPicker;
