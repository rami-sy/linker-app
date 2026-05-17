import {
  setFormData,
  setLoading,
  resetForm,
  selectFormData,
  selectIsLoading,
} from "../../redux/formSlice";

import { View, ScrollView } from "react-native";
import React, { useEffect } from "react";

import Input from "../input";
import CategoryPicker from "../category-picker";
import Button from "../button";
import { useDispatch, useSelector } from "react-redux";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import { useTranslatedAttributes } from "../../constants";
import { useTranslation } from "react-i18next";

const Background = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const isLoading = useSelector(selectIsLoading);
  const { user } = useSelector((state) => state.users);
  const { education } = useTranslatedAttributes();

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
            label={t("background.education", "Education")}
            items={education}
            value={formData?.education}
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  education: value,
                })
              )
            }
            name="education"
          />
          <Input
            containerStyle="w-full mb-2"
            inputStyle="h-12"
            placeholder={t("background.occupation", "Occupation")}
            value={formData?.occupation}
            onChange={(text) =>
              dispatch(
                setFormData({
                  ...formData,
                  occupation: text,
                })
              )
            }
            autoCapitalize="none"
          />
        </View>
      </ScrollView>
      <Button
        label={t("background.updateProfile", "Update Profile")}
        disabled={isLoading}
        onPress={handleSave}
        w={"w-full"}
        isLoading={isLoading}
        mb={"mb-0"}
      />
    </>
  );
};

export default Background;
