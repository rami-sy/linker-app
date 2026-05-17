import {
  setFormData,
  setErrors,
  setLoading,
  resetForm,
  selectFormData,
  selectFormErrors,
  selectIsLoading,
} from "../../redux/formSlice";

import { View, ScrollView } from "react-native";
import React, { useEffect, useState } from "react";

import Input from "../input";
import * as GetLocation from "expo-location";
import Checkbox from "../checkbox";
import Button from "../button";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import { useDispatch, useSelector } from "react-redux";
import isoCountryToEnglish from "../../lib/isoCountryToEnglish";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";

const Location = ({ fromProfile = false }) => {
  const { t } = useTranslation(); // استخدام الترجمة
  const [locationEnabled, setLocationEnabled] = useState(false);
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const isLoading = useSelector(selectIsLoading);
  const { user } = useSelector((state) => state.users);
  const { from } = useLocalSearchParams();
  console.log({ from });
  useEffect(() => {
    if (user) {
      dispatch(setFormData(user));
    }

    return () => {
      dispatch(resetForm());
    };
  }, [user, dispatch]);

  async function getAddress(latitude, longitude) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.results.length > 0) {
        const addressComponents = data.results[0].address_components;
        const address = addressComponents.reduce((acc, component) => {
          acc[component.types[0]] = component.long_name;
          return acc;
        }, {});
        console.log(address); // Contains street_number, route (street name), postal_code, etc.
        return address;
      } else {
        console.log("No address found");
        return {};
      }
    } catch (error) {
      console.error("Reverse Geocoding failed:", error);
      return {};
    }
  }

  const fetchAndUpdateLocation = async () => {
    let { status } = await GetLocation.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      console.error("Location permission not granted");
      return;
    }

    try {
      let location = await GetLocation.getCurrentPositionAsync({});
      const address = await getAddress(
        location.coords.latitude,
        location.coords.longitude
      );

      console.log({ location, address });

      // تحديث الحقول من العنوان المسترجع
      const city = address.administrative_area_level_2 || "";
      const state = address.administrative_area_level_1 || "";
      const country = address.country || "";

      // تحديث النموذج بالبيانات المسترجعة
      dispatch(
        setFormData({
          ...formData,
          location: {
            type: "Point",
            coordinates: [location.coords.longitude, location.coords.latitude],
            city, // تحديث المدينة
            state, // تحديث الولاية
            country, // تحديث البلد
          },
        })
      );
    } catch (error) {
      console.error("Error fetching location or geocoding:", error);
    }
  };
  useEffect(() => {
    if (locationEnabled) {
      fetchAndUpdateLocation();
    }
  }, [locationEnabled]);

  const handleSave = async () => {
    dispatch(setLoading(true));

    try {
      // Retrieve the current location data from the form
      const locationData = formData?.location;

      // If coordinates exist, apply a random offset for privacy
      let updatedFormData = { ...formData };
      if (locationData && Array.isArray(locationData.coordinates)) {
        const originalLongitude = locationData.coordinates[0];
        const originalLatitude = locationData.coordinates[1];

        // Generate a random offset between -0.25 and +0.25 degrees
        const randomOffset = () => (Math.random() - 0.5) * 0.5; // (-0.25, +0.25)

        const randomizedLongitude = originalLongitude + randomOffset();
        const randomizedLatitude = originalLatitude + randomOffset();

        // Update the form data with the randomized coordinates
        updatedFormData = {
          ...formData,
          location: {
            ...locationData,
            coordinates: [randomizedLongitude, randomizedLatitude],
          },
        };
      }

      // Call updateProfile with the modified form data
      const res = await updateProfile({ ...updatedFormData });

      if (res.type === "success") {
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
          if (from) {
            router.push(from);
          }
        }
      }
      dispatch(setLoading(false));
    } catch (error) {
      console.error("Error saving profile:", error);
      dispatch(setLoading(false));
    }
  };

  console.log({ locationEnabled, formData });

  //   const randomLatitude =
  //   item?.location?.coordinates?.[1] +
  //   Math.random() * 0.5 -
  //   0.25;
  // const randomLongitude =
  //   item?.location?.coordinates?.[0] +
  //   Math.random() * 0.5 -
  //   0.25;
  return (
    <>
      <ScrollView
        contentContainerStyle={{
          marginTop: 8,
          marginBottom: 8,
          width: "100%",
        }}
        className={`mb-2 w-full`}
      >
        <View className={`flex items-start w-full mb-6`}>
          <Checkbox
            value={locationEnabled}
            onChange={setLocationEnabled}
            placeholder={t("location.accessToLocation")}
          />

          <Input
            containerStyle="w-full mb-2"
            inputStyle="h-12"
            placeholder={t("location.city")}
            value={formData?.location?.city}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  location: {
                    ...formData?.location,
                    city: value,
                  },
                })
              )
            }
            autoCapitalize="none"
          />
          <Input
            containerStyle="w-full mb-2"
            inputStyle="h-12"
            placeholder={t("location.state")}
            value={formData?.location?.state}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  location: {
                    ...formData?.location,
                    state: value,
                  },
                })
              )
            }
            autoCapitalize="none"
          />
          <Input
            containerStyle="w-full mb-2"
            inputStyle="h-12"
            placeholder={t("location.country")}
            value={formData?.location?.country}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  location: {
                    ...formData?.location,
                    country: value,
                  },
                })
              )
            }
            autoCapitalize="none"
          />
        </View>
      </ScrollView>
      {fromProfile && (
        <Button
          label={t("location.updateProfileButton")}
          disabled={isLoading}
          onPress={handleSave}
          w={"w-full"}
          isLoading={isLoading}
          mb={"mb-0"}
        />
      )}
    </>
  );
};

export default Location;
