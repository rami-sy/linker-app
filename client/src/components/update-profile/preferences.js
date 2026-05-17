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
import Joi from "joi";
import Button from "../button";
import { useDispatch, useSelector } from "react-redux";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import Input from "../input";
import { useTranslatedAttributes } from "../../constants";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "../../../lib/useColorScheme";

const Preferences = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const errors = useSelector(selectFormErrors);
  const isLoading = useSelector(selectIsLoading);
  const { user } = useSelector((state) => state.users);
  const { gender, lookingFor, preferredCommunications } =
    useTranslatedAttributes();

  useEffect(() => {
    if (user) {
      dispatch(
        setFormData({
          ...user,
        })
      );
    }

    return () => {
      dispatch(resetForm());
    };
  }, [user, dispatch]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const [minAge, maxAge] = formData?.preferredAgeRange || [];
  
      let updatedRange = [minAge, maxAge];
      if (minAge > maxAge) {
        updatedRange = [maxAge, minAge];
      }
      if (minAge < 18) {
        updatedRange[0] = 18;
      }
      if (maxAge > 100) {
        updatedRange[1] = 100;
      }

  
      // Only dispatch if value actually changed to avoid infinite loop
      if (
        updatedRange[0] !== minAge ||
        updatedRange[1] !== maxAge
      ) {
        dispatch(setFormData({
          ...formData,
          preferredAgeRange: updatedRange,
        }));
      }
    }, 1000); // 1 second delay
  
    return () => clearTimeout(timeout);
  }, [formData?.preferredAgeRange?.[0], formData?.preferredAgeRange?.[1]]);



  const schema = Joi.object({
    // preferredGenders: Joi.array()
    //   .min(1)
    //   .required()
    //   .messages({
    //     "array.min": t("preferences.errors.preferredGendersRequired"),
    //     "any.required": t("preferences.errors.preferredGendersRequired"),
    //   }),
    // lookingFor: Joi.array()
    //   .min(1)
    //   .required()
    //   .messages({
    //     "array.min": t("preferences.errors.lookingForRequired"),
    //     "any.required": t("preferences.errors.lookingForRequired"),
    //   }),
    // preferredAgeRange: Joi.array()
    //   .length(2)
    //   .items(Joi.number().integer().min(18).max(100))
    //   .required()
    //   .messages({
    //     "array.length": t("preferences.errors.ageRange.rangeLength"),
    //     "any.required": t("preferences.errors.ageRange.required"),
    //     "number.base": t("preferences.errors.ageRange.base"),
    //     "number.integer": t("preferences.errors.ageRange.integer"),
    //     "number.min": t("preferences.errors.ageRange.min"),
    //     "number.max": t("preferences.errors.ageRange.max"),
    //   })
    //   .custom((value, helpers) => {
    //     const [minAge, maxAge] = value;
    //     if (minAge > maxAge) {
    //       return helpers.message(
    //         t("preferences.errors.ageRange.minGreaterThanMax")
    //       );
    //     }
    //     if (maxAge < minAge) {
    //       return helpers.message(
    //         t("preferences.errors.ageRange.maxLessThanMin")
    //       );
    //     }
    //     return value;
    //   }),
  }).unknown(true);

  const { isDarkColorScheme } = useColorScheme();
  const handleError = (name, value) => {
    const { error } = schema.validate({ [name]: value }, { abortEarly: false });
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
  const handleInputChange = (name, value) => {
    dispatch(
      setFormData({
        ...formData,
        [name]: value,
      })
    );

    handleError(name, value);
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
  console.log("Preferences", { formData, errors, isLoading });
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
          <CategoryPicker
            label={t("preferences.preferredGender")}
            items={gender}
            value={formData?.preferredGenders}
            onChange={(value) => {
              const updatedPreferredGenders =
                formData?.preferredGenders?.includes(value)
                  ? formData?.preferredGenders?.filter((item) => item !== value)
                  : [...formData?.preferredGenders, value];

              const updatedFormData = {
                ...formData,
                preferredGenders: updatedPreferredGenders,
              };

              dispatch(setFormData(updatedFormData));
            }}
            name="preferredGenders"
            multiple={true}
            error={errors.preferredGenders}
          />
          <CategoryPicker
            label={t("preferences.lookingFor")}
            items={lookingFor}
            value={formData?.lookingFor}
            onChange={(value) => {
              const updatedLookingFor = formData?.lookingFor?.includes(value)
                ? formData?.lookingFor?.filter((item) => item !== value)
                : [...formData?.lookingFor, value];

              const updatedFormData = {
                ...formData,
                lookingFor: updatedLookingFor,
              };

              // تحديث البيانات في الحالة العالمية
              dispatch(setFormData(updatedFormData));
            }}
            name="lookingFor"
            multiple={true}
          />

          <View className={`flex items-start w-full mb-6`}>

            <View className={`flex-row justify-between w-full`}>
              <Input
                containerStyle="flex-1 mr-2 mb-0"
                inputStyle="h-12"
                placeholder={t("addFriendScreen.filter.minAge")}
                type="number"
                value={formData?.preferredAgeRange?.[0]}
                onChange={(value) => {
                  dispatch(
                    setFormData({
                      ...formData,
                      preferredAgeRange: [value, formData?.preferredAgeRange?.[1]],
                    })
                  );
                }}
                autoCapitalize="none"
              />
              <Input
                containerStyle="flex-1 ml-2 mb-0"
                inputStyle="h-12"
                placeholder={t("preferences.maxAge")}
                type="number"
                value={formData?.preferredAgeRange?.[1]}
                onChange={(value) => {
                  dispatch(
                    setFormData({
                      ...formData,
                      preferredAgeRange: [formData?.preferredAgeRange?.[0], value],
                    })
                  );
                }}
                autoCapitalize="none"
              />
            </View>
          </View>

          <CategoryPicker
            label={t("preferences.preferredCommunication")}
            items={preferredCommunications}
            value={formData?.preferredCommunications}
            onChange={(value) => {
              const updatedPreferredCommunications =
                formData?.preferredCommunications?.includes(value)
                  ? formData?.preferredCommunications?.filter(
                      (item) => item !== value
                    )
                  : [...formData?.preferredCommunications, value];

              const updatedFormData = {
                ...formData,
                preferredCommunications: updatedPreferredCommunications,
              };

              // تحديث البيانات في الحالة العالمية
              dispatch(setFormData(updatedFormData));
            }}
            name="preferredCommunications"
            multiple={true}
          />
        </View>
      </ScrollView>
      <Button
        label={t("preferences.updateProfileButton")}
        disabled={Object.keys(errors).length > 0 || isLoading}
        onPress={handleSave}
        w={"w-full"}
        isLoading={isLoading}
        mb={"mb-0"}
      />
    </>
  );
};

export default Preferences;
