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
import React, { useEffect } from "react";

import CategoryPicker from "../category-picker";
import Slider from "../slider";
import { useDispatch, useSelector } from "react-redux";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import Button from "../button";
import { useTranslatedAttributes } from "../../constants";
import { useTranslation } from "react-i18next";

const PhysicalAttributes = () => {
  const { t } = useTranslation(); // استخدام الترجمة
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const isLoading = useSelector(selectIsLoading);
  const { user } = useSelector((state) => state.users);
  const { bodyType } = useTranslatedAttributes();
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
      const res = await updateProfile({ ...formData });

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
          <Slider
            min={140}
            max={220}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  height: value,
                })
              )
            }
            value={formData?.height}
            placeholder={t("physicalAttributes.height")}
            name="height"
            unit="cm"
          />

          <Slider
            min={40}
            max={160}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  weight: value,
                })
              )
            }
            value={formData?.weight}
            placeholder={t("physicalAttributes.weight")}
            name="weight"
            unit="kg"
          />

          <CategoryPicker
            label={t("physicalAttributes.bodyType")}
            items={bodyType}
            value={formData?.bodyType}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  bodyType: value,
                })
              )
            }
            name="bodyType"
          />
        </View>
      </ScrollView>
      <Button
        label={t("physicalAttributes.updateProfileButton")}
        disabled={isLoading}
        onPress={handleSave}
        w={"w-full"}
        isLoading={isLoading}
        mb={"mb-0"}
      />
    </>
  );
};

export default PhysicalAttributes;
