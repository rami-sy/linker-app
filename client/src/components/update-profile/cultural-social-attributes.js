import {
  setFormData,
  setErrors,
  setLoading,
  resetForm,
  selectFormData,
  selectFormErrors,
  selectIsLoading,
} from "../../redux/formSlice";

import { ScrollView, View } from "react-native";
import React, { useEffect } from "react";

import CategoryPicker from "../category-picker";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import { useDispatch, useSelector } from "react-redux";
import Button from "../button";
import { useTranslatedAttributes } from "../../constants";
import { useTranslation } from "react-i18next";

const CulturalSocialAttributes = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const isLoading = useSelector(selectIsLoading);
  const { user } = useSelector((state) => state.users);
  const { zodiacSign, personalityType, religion, politicalViews } = useTranslatedAttributes();
  useEffect(() => {
    if (user) {
      dispatch(setFormData(user));
    }

    return () => {
      dispatch(resetForm());
    };
  }, [user, dispatch]);

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
            label={t("culturalSocialAttributes.religion", "Religion")}
            items={religion}
            value={formData?.religion}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  religion: value,
                })
              )
            }
            name="religion"
          />

          <CategoryPicker
            label={t("culturalSocialAttributes.politicalViews", "Political Views")}
            items={politicalViews}
            value={formData?.politicalViews}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  politicalViews: value,
                })
              )
            }
            name="politicalViews"
          />

          <CategoryPicker
            label={t("culturalSocialAttributes.zodiacSign", "Zodiac Sign")}
            value={formData?.zodiacSign}
            items={zodiacSign}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  zodiacSign: value,
                })
              )
            }
            name="zodiacSign"
          />

          <CategoryPicker
            label={t(
              "culturalSocialAttributes.personalityType",
              "Personality Type"
            )}
            items={personalityType}
            value={formData?.personalityType}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  personalityType: value,
                })
              )
            }
            name="personalityType"
          />
        </View>
      </ScrollView>
      <Button
        label={t("culturalSocialAttributes.updateProfile", "Update Profile")}
        disabled={isLoading}
        onPress={handleSave}
        w={"w-full"}
        isLoading={isLoading}
        mb={"mb-0"}
      />
    </>
  );
};

export default CulturalSocialAttributes;
