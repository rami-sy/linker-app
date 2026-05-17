import {
  setFormData,
  setErrors,
  setLoading,
  resetForm,
  selectFormData,
  selectFormErrors,
  selectIsLoading,
} from "../../redux/formSlice";

import { View, ScrollView, Text, TouchableOpacity } from "react-native";
import React, { useEffect, useState } from "react";

import { getAllInterests } from "../../api/interests";
import CategoryPicker from "../category-picker";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import { useDispatch, useSelector } from "react-redux";
import Button from "../button";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "../../../lib/useColorScheme";

const Interests = ({ fromProfile = false, withLabel = true }) => {
  const { t } = useTranslation(); // استخدام الترجمة
  const [interests, setInterests] = useState([]);
  const [showMore, setShowMore] = useState(false);
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const isLoading = useSelector(selectIsLoading);
  const { user } = useSelector((state) => state.users);
  const initialDisplayCount = 20; // عدد العناصر التي ستظهر في البداية
  const { isDarkColorScheme } = useColorScheme();

  useEffect(() => {
    if (user) {
      dispatch(setFormData(user));
    }

    return () => {
      dispatch(resetForm());
    };
  }, [user, dispatch]);

  useEffect(() => {
    const loadInterests = async () => {
      const res = await getAllInterests();

      if (res.type === "success") {
        setInterests(res.data);
      }
    };

    loadInterests();

    return () => {
      setInterests([]);
    };
  }, []);

  const handleSave = async () => {
    dispatch(setLoading(true));

    try {
      const res = await updateProfile({
        ...formData,
      });

      if (res.type === "success") {
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
        }
      }
      dispatch(setLoading(false));
    } catch (error) {
      dispatch(setLoading(false));
    }
  };

  const displayedInterests = showMore
    ? interests
    : interests.slice(0, initialDisplayCount);

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          marginTop: 8,
          marginBottom: 8,
        }}
        className={`mb-2`}
      >
        <View className={`flex items-start w-full mb-6`}>
          <CategoryPicker
            mb="mb-0"
            label={t("interests.label")}
            items={displayedInterests}
            value={formData?.interests}
            valueKey="name"
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  interests: formData?.interests.includes(value)
                    ? formData?.interests.filter((item) => item !== value)
                    : [...formData?.interests, value],
                })
              )
            }
            name="interests"
            multiple={true}
            withLabel={withLabel}
          />
          {interests.length > initialDisplayCount && (
            <TouchableOpacity
              onPress={() => setShowMore(!showMore)}
              className={`mt-2`}
            >
              <Text
                className="underline text-slate-600 dark:text-slate-300"
              >
                {showMore ? t("interests.showLess") : t("interests.showMore")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      {fromProfile && (
        <Button
          label={t("interests.updateProfileButton")}
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

export default Interests;
