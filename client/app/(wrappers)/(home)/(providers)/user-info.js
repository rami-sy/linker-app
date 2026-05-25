import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  I18nManager,
} from "react-native";

import Input from "~/src/components/input";
import CategoryPicker from "~/src/components/category-picker";
import Layout from "~/src/components/layout";
import { getMe, updateProfile } from "~/src/api/me";
import GetLocation from "~/src/components/update-profile/location";
import GetInterests from "~/src/components/update-profile/Interests";
import GetLanguages from "~/src/components/update-profile/languages";
import { useDispatch, useSelector } from "react-redux";
import FeIcon from "react-native-vector-icons/Feather";
import { removeMe, setMe } from "~/src/redux/userSlice";
import Joi from "joi";
import {
  setFormData,
  setErrors,
  setLoading,
  resetForm,
  selectFormData,
  selectFormErrors,
  selectIsLoading,
} from "~/src/redux/formSlice";
import Popup from "~/src/components/popup";
import { useTranslatedAttributes } from "~/src/constants";
import { useTranslation } from "react-i18next";
import { removeItem } from "~/src/utils/localStorage";
import { router } from "expo-router";
import { getLocales } from "expo-localization";
import Pictures from "~/src/components/update-profile/pictures";
import Head from "expo-router/head";
// import Picker from "../../../../src/components/picker";
import DropDownPicker from "react-native-dropdown-picker";
import Picker from "~/src/components/picker";
import CountryPicker, { DARK_THEME } from "react-native-country-picker-modal";
import isoCountryToEnglish from "~/src/lib/isoCountryToEnglish";
import { useColorScheme } from "~/lib/useColorScheme";

const InfoBasic = ({ formData, errors, handleInputChange }) => {
  const { t } = useTranslation();
  const { gender } = useTranslatedAttributes();

  return (
    <ScrollView
      contentContainerStyle={{ marginBottom: 8 }}
      className={`mb-6`}
    >
      <Pictures withLabel />
      <View className={`flex items-start w-full mb-4`}>
        <View className={`flex-row justify-between w-full`}>
          <Input
            containerStyle="flex-1 mr-2 mb-0"
            inputStyle="h-12"
            placeholder={t("userInfo.firstName")}
            value={formData.firstName}
            onChange={(text) => handleInputChange("firstName", text)}
            autoCapitalize="none"
            error={errors.firstName}
          />
          <Input
            containerStyle="flex-1 ml-2 mb-0"
            inputStyle="h-12"
            placeholder={t("userInfo.lastName")}
            value={formData.lastName}
            onChange={(text) => handleInputChange("lastName", text)}
            autoCapitalize="none"
            error={errors.lastName}
          />
        </View>
      </View>
      <CategoryPicker
        label={t("userInfo.gender")}
        items={gender}
        value={formData?.gender}
        onChange={(value) => handleInputChange("gender", value)}
        name="gender"
        error={errors.gender}
      />
    </ScrollView>
  );
};

const InfoDetails = ({ formData, errors, handleInputChange }) => {
  const { t } = useTranslation();
  const [showNationality, setShowNationality] = useState(false);
  const dispatch = useDispatch();
  const { maritalStatus, days, months, years, preferredCommunications } = useTranslatedAttributes();
  const isRTL = I18nManager.isRTL;

  const onSelect = (country) => {
    dispatch(setFormData({ ...formData, nationality: isoCountryToEnglish[country.cca2] }));
    setShowNationality(false);
  };

  return (
    <ScrollView
      contentContainerStyle={{ marginBottom: 8 }}
      className={`mb-6`}
    >
      <View className={`flex items-start w-full mb-6 z-10`}>
        <View className={`${isRTL ? "flex-row-reverse" : "flex-row"} justify-between w-full`}>
          <Picker
            containerStyle="flex-1 mr-2 mb-0"
            label={t("userInfo.month")}
            placeholder={t("select.selectMonth")}
            value={formData?.birthDate?.month}
            onChange={(state) => handleInputChange("birthDate", { ...formData.birthDate, month: state() })}
            error={errors.birthDate}
            options={months}
          />
          <Picker
            containerStyle="flex-1 mx-2 mb-0"
            label={t("userInfo.day")}
            placeholder={t("select.selectDay")}
            value={formData?.birthDate?.day}
            onChange={(state) => handleInputChange("birthDate", { ...formData.birthDate, day: state() })}
            error={errors.birthDate}
            options={days}
          />
          <Picker
            containerStyle="flex-1 ml-2 mb-0"
            label={t("userInfo.year")}
            placeholder={t("select.selectYear")}
            value={formData?.birthDate?.year}
            onChange={(state) => handleInputChange("birthDate", { ...formData.birthDate, year: state() })}
            error={errors.birthDate}
            options={years}
          />
        </View>
        {errors.birthDate && (
          <Text className={`mb-1 ml-2 text-base text-[#f56800]`}>{errors.birthDate}</Text>
        )}
      </View>

      <Input
        containerStyle="w-full"
        inputStyle="h-12"
        placeholder={t("info.nationality")}
        value={formData?.nationality}
        onPress={() => setShowNationality(!showNationality)}
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

      <CategoryPicker
        label={t("userInfo.maritalStatus")}
        items={maritalStatus}
        value={formData?.maritalStatus}
        onChange={(value) => handleInputChange("maritalStatus", value)}
        name="maritalStatus"
      />

      <CategoryPicker
        label={t("preferences.preferredCommunication")}
        items={preferredCommunications}
        value={formData?.preferredCommunications}
        onChange={(value) => {
          const updatedPreferredCommunications = formData?.preferredCommunications?.includes(value)
            ? formData?.preferredCommunications?.filter((item) => item !== value)
            : [...formData?.preferredCommunications, value];
          dispatch(setFormData({ ...formData, preferredCommunications: updatedPreferredCommunications }));
        }}
        name="preferredCommunications"
        multiple={true}
      />
    </ScrollView>
  );
};

const Location = () => {
  return <GetLocation />;
};

const Interests = () => {
  return (
    <ScrollView
      contentContainerStyle={{
        marginBottom: 8,
      }}
      className={`mb-6`}
    >
      <View className={`flex items-start w-full mb-6`}>
        <GetInterests withLabel={false} />
      </View>
    </ScrollView>
  );
};

const Languages = () => {
  return (
    <ScrollView
      contentContainerStyle={{
        marginBottom: 8,
      }}
      className={`mb-6`}
    >
      <View className={`flex items-start w-full mb-6`}>
        <GetLanguages withLabel={false} />
      </View>
    </ScrollView>
  );
};

const UserInfo = () => {
  const { t } = useTranslation();
  const [swipeDirection, setSwipeDirection] = useState(0); // 0 means no swipe, 1 for left, 2 for right
  const formData = useSelector(selectFormData);
  const errors = useSelector(selectFormErrors);
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.users);
  const [showBackScreen, setShowBackScreen] = useState(false);
  const { isDarkColorScheme } = useColorScheme();
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
        "string.empty": t("userInfo.firstNameRequired"),
      }),
    lastName: Joi.string()
      .required()
      .messages({
        "string.empty": t("userInfo.lastNameRequired"),
      }),
    // birthDate: Joi.object({
    //   month: Joi.number()
    //     .integer()
    //     .min(1)
    //     .max(12)
    //     .required()
    //     .messages({
    //       "number.base": t("userInfo.monthMustBeNumber"),
    //       "number.min": t("userInfo.monthRange"),
    //       "number.max": t("userInfo.monthRange"),
    //       "any.required": t("userInfo.monthRequired"),
    //     }),
    //   day: Joi.number()
    //     .integer()
    //     .min(1)
    //     .max(31)
    //     .required()
    //     .messages({
    //       "number.base": t("userInfo.dayMustBeNumber"),
    //       "number.min": t("userInfo.dayRange"),
    //       "number.max": t("userInfo.dayRange"),
    //       "any.required": t("userInfo.dayRequired"),
    //     }),
    //   year: Joi.number()
    //     .integer()
    //     .min(1900)
    //     .max(new Date().getFullYear())
    //     .required()
    //     .messages({
    //       "number.base": t("userInfo.yearMustBeNumber"),
    //       "number.min": t("userInfo.yearMin"),
    //       "number.max": t("userInfo.yearMax", {
    //         year: new Date().getFullYear(),
    //       }),
    //       "any.required": t("userInfo.yearRequired"),
    //     }),
    // })
    //   .required()
    //   .messages({
    //     "any.required": t("userInfo.birthDateRequired"),
    //   }),
    gender: Joi.string()
      .required()
      .messages({
        "string.empty": t("userInfo.genderRequired"),
      }),

    // preferredGenders: Joi.array()
    //   .min(1)
    //   .required()
    //   .messages({
    //     "array.min": t("userInfo.preferredGendersRequired"),
    //     "any.required": t("userInfo.preferredGendersRequired"),
    //   }),
    // lookingFor: Joi.array()
    //   .min(1)
    //   .required()
    //   .messages({
    //     "array.min": t("userInfo.lookingForRequired"),
    //     "any.required": t("userInfo.lookingForRequired"),
    //   }),
  }).unknown(true);
  const [showModal, setShowModal] = useState(false);
  useEffect(() => {
    if (user) {
      dispatch(setFormData(user));
    }
  }, [user, dispatch]);

  const handleInfoNext = () => {
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

    setShowModal(true);
  };
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

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
      const res = await updateProfile({
        ...formData,
        isCompleted: true,
      });

      if (res.type === "success") {
        // ✅ Fetch fresh user data and update Redux
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
          console.log("✅ Profile completed and user data updated");
        }
      }
      dispatch(setLoading(false));
    } catch (error) {
      console.error("❌ Error saving profile:", error);
      dispatch(setLoading(false));
    }
  };

  const handleInputChange = (name, value) => {
    dispatch(
      setFormData({
        ...formData,
        [name]: value,
      })
    );

    // Validate the entire form data
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

  const renderComponentBasedOnSwipe = () => {
    switch (swipeDirection) {
      case 0:
        return (
          <InfoBasic
            formData={formData}
            errors={errors}
            handleInputChange={handleInputChange}
          />
        );
      case 1:
        return (
          <InfoDetails
            formData={formData}
            errors={errors}
            handleInputChange={handleInputChange}
          />
        );
      case 2:
        return <Location />;
      case 3:
        return <Interests />;
      case 4:
        return <Languages />;
      default:
        return (
          <InfoBasic
            formData={formData}
            errors={errors}
            handleInputChange={handleInputChange}
          />
        );
    }
  };

  return (
    <>
      <Head>
        <title>User Info | Linker</title>
        <meta
          name="description"
          content="User info. Linker is the best way to connect with your friends. It's a social media platform that allows you to connect with your friends and family."
        />
      </Head>
      <Popup
        showModal={showModal}
        setShowModal={setShowModal}
        justify="justify-center"
        items="items-center"
        onCancel={() => {
          setShowModal(false);
          setSwipeDirection((prev) => prev + 1);
        }}
          onClick={() => {
            setShowModal(false);
            router.replace("/chats");
          }}
      >
        <Text
          className={`text-base text-center text-slate-800 dark:text-slate-200`}
        >
          {t("general.skipTheRest")}
        </Text>
      </Popup>
      <Layout
        pb="pb-0"
        className="flex-1 w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
        navBar={
          <View
            className={`flex-row items-center justify-between w-full gap-x-3`}
          >
            <Text
              className={`px-3 py-2 text-base bg-papaya text-slate-600 rounded-2xl`}
            >
              {swipeDirection <= 1
                ? t("userInfo.generalInfo")
                : swipeDirection === 2
                ? t("userInfo.location")
                : swipeDirection === 3
                ? t("userInfo.interests")
                : t("userInfo.languages")}
            </Text>
            <Text className="px-3 py-2 text-sm text-slate-100 bg-sec rounded-2xl">
              Step {swipeDirection + 1} / 5
            </Text>

            <Text
              className={`text-base text-slate-200  bg-sec px-3 py-2 rounded-2xl ${
                swipeDirection === 0 ? "opacity-50" : ""
              }`}
              onPress={() => {
                if (swipeDirection === 0) return;
                handleSave();
                router.replace("/chats");
              }}
            >
              {t("userInfo.skip")}
            </Text>
          </View>
        }
      >
        <Popup
          showModal={showBackScreen}
          setShowModal={setShowBackScreen}
          onClick={async () => {
            try {
              dispatch(removeMe());
              await removeItem("accessToken");
              await removeItem("refreshToken");
              await removeItem("persist:root");
              console.log("✅ User logged out from user-info");

              // ✅ Use replace for cleaner navigation
              router.replace({
                pathname: "/welcome",
                params: {
                  forceLogout: true,
                },
              });

              setShowBackScreen(false);
            } catch (error) {
              console.error("❌ Error logging out:", error);
              setShowBackScreen(false);
            }
          }}
          onCancel={() => setShowBackScreen(false)}
        >
          <Text
            className={`text-base text-center text-slate-800 dark:text-slate-200`}
          >
            {t("userInfo.confirmGoBack")}
          </Text>
          <Text
            className={`mt-2 text-base text-center text-slate-800 dark:text-slate-200`}
          >
            {t("userInfo.dataLossWarning")}
          </Text>
        </Popup>

        {renderComponentBasedOnSwipe()}
        <View
          className={`${
            isRTL ? "flex-row-reverse" : "flex-row"
          } items-center justify-between w-full p-2 mb-4`}
        >
          <TouchableOpacity
            className={`flex items-center justify-center p-3 rounded-full bg-[#ef233c] w-14 h-14`}
            onPress={() => {
              if (swipeDirection === 0) {
                setShowBackScreen(true);
              } else {
                setSwipeDirection(swipeDirection - 1);
              }
            }}
          >
            <FeIcon
              name="chevron-left"
              size={35}
              color="#dee4e6"
            />
          </TouchableOpacity>
          <TouchableOpacity
            className={`bg-[#0a97b9] p-3 rounded-full w-14 h-14 flex justify-center items-center ${
              swipeDirection === 0 && Object.keys(errors).length > 0
                ? "opacity-50"
                : ""
            }`}
            onPress={() => {
              handleSave();
              if (swipeDirection === 0) {
                handleInfoNext();
              }
              if (swipeDirection === 1) {
                setSwipeDirection(2);
              }
              if (swipeDirection === 2) {
                setSwipeDirection(3);
              }
              if (swipeDirection === 3) {
                setSwipeDirection(4);
              }
              if (swipeDirection === 4) {
                router.replace("/chats");
              }
            }}
          >
            <FeIcon
              name="chevron-right"
              size={35}
              color="#dee4e6"
            />
          </TouchableOpacity>
        </View>
      </Layout>
    </>
  );
};

export default UserInfo;
