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

import { getAllLanguages } from "../../api/language";
import CategoryPicker from "../category-picker";
import { useDispatch, useSelector } from "react-redux";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import Button from "../button";
import { useTranslation } from "react-i18next";

const Languages = ({ fromProfile = false, withLabel = true }) => {
  const { t } = useTranslation(); // استخدام الترجمة
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

  const [languages, setLanguages] = useState([]);

  useEffect(() => {
    const loadLanguages = async () => {
      const res = await getAllLanguages();

      if (res.type === "success") {
        setLanguages(res.data);
      }
    };
    loadLanguages();
    return () => {
      setLanguages([]);
    };
  }, []);

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
            label={t("languages.label")}
            items={languages}
            value={formData?.languages}
            valueKey="name"
            onChange={(value) =>
              dispatch(
                setFormData({
                  ...formData,
                  languages: formData?.languages?.includes(value)
                    ? formData?.languages?.filter((item) => item !== value)
                    : [...formData?.languages, value],
                })
              )
            }
            name="languages"
            multiple={true}
            withLabel={withLabel}
          />
        </View>
      </ScrollView>
      {fromProfile && (
        <Button
          label={t("languages.updateProfileButton")}
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

export default Languages;
