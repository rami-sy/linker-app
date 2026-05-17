import { View, Text, ScrollView, I18nManager } from "react-native";
import React, { useEffect, useRef, useState } from "react";

import Input from "../input";
import TextArea from "../text-area";
import CategoryPicker from "../category-picker";
import CountryPicker, { DARK_THEME } from "react-native-country-picker-modal";
import Joi from "joi";
import Button from "../button";
import { useSelector, useDispatch } from "react-redux";
import { updateProfile, getMe } from "../../api/me";
import {
  setFormData,
  setErrors,
  setLoading,
  resetForm,
  selectFormData,
  selectFormErrors,
  selectIsLoading,
} from "../../redux/formSlice";
import { setMe } from "../../redux/userSlice";
import { addAlert } from "../../redux/alertSlice";
import isoCountryToEnglish from "../../lib/isoCountryToEnglish";
import { useTranslatedAttributes } from "../../constants";
import { useTranslation } from "react-i18next";
import Picker from "../picker";

const Info = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const errors = useSelector(selectFormErrors);
  const isLoading = useSelector(selectIsLoading);
  const { user } = useSelector((state) => state.users);
  const { gender, maritalStatus, months, days, years } =
    useTranslatedAttributes();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  useEffect(() => {
    if (user) {
      dispatch(setFormData(user));
    }

    return () => {
      dispatch(resetForm());
    };
  }, [user, dispatch]);

  const schema = Joi.object({
    firstName: Joi.string()
      .required()
      .messages({
        "string.empty": t("info.firstNameRequired"),
      }),
    lastName: Joi.string()
      .required()
      .messages({
        "string.empty": t("info.lastNameRequired"),
      }),

    gender: Joi.string()
      .required()
      .messages({
        "string.empty": t("info.genderRequired"),
      }),
  }).unknown(true);
  const [showNationality, setShowNationality] = useState(false);

  const handleInputChange = (name, value) => {
    dispatch(
      setFormData({
        ...formData,
        [name]: value,
      })
    );

    const { error } = schema.validate(
      { ...formData, [name]: value },
      { abortEarly: false }
    );
    if (error) {
      const errorData = {};
      error.details.forEach((item) => {
        errorData[item.path[0]] = item.message;
      });
      dispatch(setErrors(errorData));
    } else {
      dispatch(setErrors({}));
    }
  };
  const { theme } = useSelector((state) => state.app);

  const onSelect = (country) => {
    dispatch(
      setFormData({
        ...formData,
        nationality: isoCountryToEnglish[country.cca2],
      })
    );
    setShowNationality(!showNationality);
  };

  const handleSave = async () => {
    const { error } = schema.validate(formData, { abortEarly: false });
    if (error) {
      const errorData = {};
      error.details.forEach((item) => {
        errorData[item.path[0]] = item.message;
      });

      dispatch(setErrors(errorData));
      return;
    } else {
      dispatch(setErrors({}));
    }

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
        <View className={`flex items-start mb-6`}>
          <View className={`flex items-start w-full mb-6`}>
            <Input
              containerStyle="flex-1 mx-0 mb-0 w-full"
              inputStyle="h-12"
              placeholder={t("info.userName")}
              value={formData.userName}
              onChange={(value) => handleInputChange("userName", value)}
              autoCapitalize="none"
              error={errors.userName}
            />
          </View>

          <View className={`flex items-start w-full mb-6`}>
            <View className={`flex-row justify-between w-full`}>
              <Input
                containerStyle="flex-1 mr-2 mb-0"
                inputStyle="h-12"
                placeholder={t("info.firstName")}
                value={formData.firstName}
                onChange={(value) => handleInputChange("firstName", value)}
                autoCapitalize="none"
                error={errors.firstName}
              />
              <Input
                containerStyle="flex-1 ml-2 mb-0"
                inputStyle="h-12"
                placeholder={t("info.lastName")}
                value={formData.lastName}
                onChange={(value) => handleInputChange("lastName", value)}
                autoCapitalize="none"
                error={errors.lastName}
              />
            </View>
          </View>

          <View className={`flex items-start w-full mb-6 z-10`}>
            <View
              className={`${
                isRTL ? "flex-row-reverse" : "flex-row"
              } justify-between w-full`}
            >
              <Picker
                containerStyle="flex-1 mr-2 mb-0"
                label={t("userInfo.month")}
                placeholder={t("select.selectMonth")}
                value={formData?.birthDate?.month}
                onChange={(state) => {
                  handleInputChange("birthDate", {
                    ...formData.birthDate,
                    month: state(),
                  });
                }}
                error={errors.birthDate}
                options={months}
              />
              <Picker
                containerStyle="flex-1 mx-2 mb-0"
                label={t("userInfo.day")}
                placeholder={t("select.selectDay")}
                value={formData?.birthDate?.day}
                onChange={(state) => {
                  handleInputChange("birthDate", {
                    ...formData.birthDate,
                    day: state(),
                  });
                }}
                error={errors.birthDate}
                options={days}
              />

              <Picker
                containerStyle="flex-1 ml-2 mb-0"
                label={t("userInfo.year")}
                placeholder={t("select.selectYear")}
                value={formData?.birthDate?.year}
                onChange={(state) => {
                  handleInputChange("birthDate", {
                    ...formData.birthDate,
                    year: state(),
                  });
                }}
                error={errors.birthDate}
                options={years}
              />
            </View>
            {errors.birthDate && (
              <Text className={`mb-1 ml-2 text-base text-[#f56800]`}>
                {errors.birthDate}
              </Text>
            )}
          </View>
          <CategoryPicker
            label={t("info.gender")}
            items={gender}
            value={formData?.gender}
            onChange={(value) => {
              handleInputChange("gender", value);
            }}
            name="gender"
            error={errors.gender}
          />
          <CategoryPicker
            label={t("info.maritalStatus")}
            items={maritalStatus}
            value={formData?.maritalStatus ?? "single"}
            onChange={(value) => {
              dispatch(
                setFormData({
                  ...formData,
                  maritalStatus: value,
                })
              );
            }}
            name="maritalStatus"
          />
          <Input
            containerStyle="w-full"
            inputStyle="h-12"
            placeholder={t("info.nationality")}
            value={formData?.nationality}
            onPress={() => {
              setShowNationality(!showNationality);
            }}
            autoCapitalize="none"
            type={"number"}
          />
          <CountryPicker
            visible={showNationality}
            withAlphaFilter={true}
            withFilter={true}
            withFlag={true}
            theme={DARK_THEME}
            onSelect={onSelect}
            placeholder={""}
          />
          <TextArea
            containerStyle="w-full"
            inputStyle="h-24"
            placeholder={t("info.bio")}
            value={formData.bio}
            onChange={(text) => handleInputChange("bio", text)}
            autoCapitalize="none"
          />

      
        </View>
      </ScrollView>
      <Button
        label={t("info.updateProfileButton")}
        disabled={Object.keys(errors).length > 0 || isLoading}
        onPress={handleSave}
        w={"w-full"}
        isLoading={isLoading}
        mb={"mb-0"}
      />
    </>
  );
};

export default Info;
