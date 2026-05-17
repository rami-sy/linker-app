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

import Checkbox from "../checkbox";
import Button from "../button";
import { useDispatch, useSelector } from "react-redux";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import { useTranslation } from "react-i18next";

const FamilyPreferences = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const isLoading = useSelector(selectIsLoading);
  const { user } = useSelector((state) => state.users);

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
        className={`mb-2 w-full`}
      >
        <View className={`flex items-start w-full mb-6`}>
          <View className={`flex flex-row w-full flex-wrap gap-x-2`}>
            <Checkbox
              onChange={(value) =>
                dispatch(
                  setFormData({
                    ...formData,
                    wantsKids: value,
                  })
                )
              }
              name="wantsKids"
              placeholder={t("familyPreferences.wantsKids", "Wants Kids")}
              value={!!formData?.wantsKids}
            />
            <Checkbox
              onChange={(value) =>
                dispatch(
                  setFormData({
                    ...formData,
                    hasKids: value,
                  })
                )
              }
              name="hasKids"
              placeholder={t("familyPreferences.hasKids", "Has Kids")}
              value={!!formData?.hasKids}
            />
          </View>
          <Checkbox
            onChange={(value) => {
              dispatch(
                setFormData({
                  ...formData,
                    hasPets: value,
                })
              );
            }}
            name="hasPets"
            value={!!formData?.hasPets}
            placeholder={t("lifestyle.hasPets")}
          />
        </View>
      </ScrollView>
      <Button
        label={t("familyPreferences.updateProfile", "Update Profile")}
        disabled={isLoading}
        onPress={handleSave}
        w={"w-full"}
        isLoading={isLoading}
        mb={"mb-0"}
      />
    </>
  );
};

export default FamilyPreferences;
