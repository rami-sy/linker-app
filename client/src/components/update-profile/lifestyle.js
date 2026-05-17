import {
  setFormData,
  setErrors,
  setLoading,
  resetForm,
  selectFormData,
  selectFormErrors,
  selectIsLoading,
} from "../../redux/formSlice";

import { View, ScrollView, Text } from "react-native";
import React, { useEffect, useState } from "react";

import CategoryPicker from "../category-picker";
import Checkbox from "../checkbox";
import Joi from "joi";
import Button from "../button";
import { useDispatch, useSelector } from "react-redux";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import { useTranslatedAttributes } from "../../constants";
import { useTranslation } from "react-i18next";

const Lifestyle = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const isLoading = useSelector(selectIsLoading);
  const { user } = useSelector((state) => state.users);
  const { diet, drinking, exercise, sleepSchedule, smoking } =
    useTranslatedAttributes();

  useEffect(() => {
    if (user) {
      dispatch(setFormData(user));
    }

    return () => {
      dispatch(resetForm());
    };
  }, [user, dispatch]);

  const handleInputChange = (name, value) => {
    dispatch(
      setFormData({
        ...formData,
        [name]: value,
      })
    );
  };

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
          <CategoryPicker
            label={t("lifestyle.smoking")}
            items={smoking}
            value={formData?.smoking}
            onChange={(value) => {
              dispatch(
                setFormData({
                  ...formData,
                  smoking: value,
                })
              );
            }}
            name="smoking"
          />

          <CategoryPicker
            label={t("lifestyle.drinking")}
            items={drinking}
            value={formData?.drinking}
            onChange={(value) => {
              dispatch(
                setFormData({
                  ...formData,
                  drinking: value,
                })
              );
            }}
            name="drinking"
          />

          <CategoryPicker
            label={t("lifestyle.exercise")}
            items={exercise}
            value={formData?.exercise}
            onChange={(value) => {
              dispatch(
                setFormData({
                  ...formData,
                  exercise: value,
                })
              );
            }}
            name="exercise"
          />

          <CategoryPicker
            label={t("lifestyle.diet")}
            items={diet}
            value={formData?.diet}
            onChange={(value) => {
              dispatch(
                setFormData({
                  ...formData,
                  diet: value,
                })
              );
            }}
            name="diet"
          />

          <CategoryPicker
            label={t("lifestyle.sleepSchedule")}
            items={sleepSchedule}
            value={formData?.sleepSchedule}
            onChange={(value) => {
              dispatch(
                setFormData({
                  ...formData,
                  sleepSchedule: value,
                })
              );
            }}
            name="sleepSchedule"
          />


        </View>
      </ScrollView>
      <Button
        label={t("lifestyle.updateProfileButton")}
        disabled={isLoading}
        onPress={handleSave}
        w={"w-full"}
        isLoading={isLoading}
        mb={"mb-0"}
      />
    </>
  );
};

export default Lifestyle;
