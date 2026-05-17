import React, { useEffect, useState } from "react";
import Popup from "../popup.js";
import {
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import CountryPicker, { DARK_THEME } from "react-native-country-picker-modal";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import isoCountryToEnglish from "../../lib/isoCountryToEnglish.js";
import _ from "lodash";
import Input from "../input.js";
import CategoryPicker from "../category-picker.js";
import Collapse from "../collapse.js";
import Slider from "../slider.js";
import Button from "../button.js";
import { useTranslatedAttributes } from "../../constants/index.js";
import { getAllInterests } from "../../api/interests.js";
import { getAllLanguages } from "../../api/language.js";
import useKeyboardVisibility from "../../hooks/use-keyboard-visibility.js";
import { router } from "expo-router";
import { getLocales } from "expo-localization";
import logger from "../../utils/logger";
import {
  setChangeFilter,
  setLoading,
  setPage,
} from "../../redux/exploreSlice.js";
import { Cat } from "lucide-react-native";
import { useColorScheme } from "../../../lib/useColorScheme";

const ShowFilterPopup = ({
  showFilter,
  setShowFilter,
  formData,
  setFormData,
  usersCount,
  setSearchChanged,
  setShowLoactionRedirection,
  onSearchUsers,
  onDismissWithoutApply,
  onApply,
}) => {
  const [showNationality, setShowNationality] = useState(false);
  const [showCountry, setShowCountry] = useState(false);
  const {

    loading,
  } = useSelector((state) => state.explore); 
  const [languages, setLanguages] = useState([]);
  const [localMinAge, setLocalMinAge] = useState(
    formData.preferredAgeRange?.[0]?.toString()
  );
  const isFirstRun = React.useRef(true);

  logger.debug("Filter form data", { formData });

  // للاحتفاظ بـ id المؤقّت حتى نستطيع إلغاؤه عند تحديث الكتابة
  const [debounceTimer, setDebounceTimer] = useState(null);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    // إذا كان هناك مؤقّت سابق، قم بإلغائه قبل إنشاء مؤقّت جديد
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // نحدّد مؤقّت لتحديث القيم بعد 1 ثانية من آخر تعديل
    const timerId = setTimeout(() => {
      let minAgeValue = parseInt(localMinAge, 10);

      // إذا كانت القيمة المدخلة أقل من 18 أو ليست رقمًا
      if (isNaN(minAgeValue) || minAgeValue < 18) {
        minAgeValue = 18;
      }

      // نجلب القيمة القصوى الحالية من formData
      let maxAgeValue = parseInt(formData.preferredAgeRange?.[1], 10);
      if (isNaN(maxAgeValue) || maxAgeValue < 18) {
        maxAgeValue = 100;
      }

      // نحدّث الـ formData بالقيمة الصحيحة
      debounceSetFormData({
        ...formData,
        preferredAgeRange: [minAgeValue, maxAgeValue],
      });

      // نحدّث القيمة المحليّة حتى تظهر للمستخدم
      setLocalMinAge(String(minAgeValue));
    }, 1000);

    // تخزين رقم المؤقّت في الـ state
    setDebounceTimer(timerId);

    // تنظيف المؤقّت عند إلغاء المكوّن أو تغيير localMinAge
    return () => clearTimeout(timerId);
  }, [localMinAge]);

  const [interests, setInterests] = useState([]);

  useEffect(() => {
    const loadInterests = async () => {
      const res = await getAllInterests();

      if (res.type === "success") {
        setInterests(res.data);
      }
    };
    const loadLanguages = async () => {
      const res = await getAllLanguages();

      if (res.type === "success") {
        setLanguages(res.data);
      }
    };
    loadInterests();

    loadLanguages();

    return () => {
      setInterests([]);
      setInterests([]);
    };
  }, []);

  const { user } = useSelector((state) => state.users);
  const { t } = useTranslation();
  const keyboardVisible = useKeyboardVisibility();
  const {
    drinking,
    education,
    gender,
    lookingFor,
    maritalStatus,
    personalityType,
    religion,
    smoking,
    zodiacSign,
    preferredCommunications,
  } = useTranslatedAttributes();

  const initialDisplayCount = 20; // Number of items to show initially

  const [showMore, setShowMore] = useState(false);
  const dispatch = useDispatch();
  const [ageRange, setAgeRange] = useState(
    formData?.preferredAgeRange
  );


  useEffect(() => {
    const timeout = setTimeout(() => {
      const [minAge, maxAge] = ageRange || [];
  
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
        updatedRange[1] !== maxAge ||
        updatedRange[0] !== formData?.preferredAgeRange?.[0] ||
        updatedRange[1] !== formData?.preferredAgeRange?.[1]
      ) {
        setAgeRange(updatedRange);

        if(updatedRange[0] >= 18 && updatedRange[1] <= 100){
            debounceSetFormData({
              ...formData,
              preferredAgeRange: updatedRange,
            });
          }
      }
    }, 1000); // 1 second delay
  
    return () => clearTimeout(timeout);
  }, [ageRange]);



  const debounceSetFormData = (formData) => {
    dispatch(setPage(1));
    setSearchChanged(true);
    dispatch(setLoading(true));
    setFormData(formData);
    dispatch(setChangeFilter(true));
  };
  const displayedInterests = showMore
    ? interests
    : interests.slice(0, initialDisplayCount);
  const { isDarkColorScheme } = useColorScheme();
  const { height: windowHeight } = useWindowDimensions();
  /** Popup title + subtitle + padding + safe margin — avoid sheet + header exceeding viewport */
  const reservedOutsideSheet = 130;
  const sheetHeight = keyboardVisible
    ? windowHeight * 0.5
    : Math.max(
        280,
        Math.min(windowHeight - reservedOutsideSheet - 16, windowHeight * 0.78)
      );

  return (
    <Popup
      showModal={showFilter}
      onCancel={
        onDismissWithoutApply ||
        (() => {
          setShowFilter(false);
          setSearchChanged(false);
        })
      }
      withActions={false}
      w="w-11/12"
      p="px-0"
      pt="pt-0"
      title={t("addFriendScreen.filter.title") || "Filter"}
      subtitle={`${t("addFriendScreen.filter.discover")} +${usersCount} ${t(
        "addFriendScreen.filter.users"
      )}`}
    >
      <View
        style={{
          width: "100%",
          height: sheetHeight,
          maxHeight: sheetHeight,
          flexDirection: "column",
        }}
      >
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        nestedScrollEnabled
        contentContainerStyle={{
          marginTop: 8,
          paddingTop: 12,
          paddingBottom: Platform.OS === "ios" ? 28 : 24,
          paddingHorizontal: 4,
        }}
        className="w-full"
      >
        <Input
          widthLabel={false}
          containerStyle="w-full"
          inputStyle="h-12"
          placeholder={t("addFriendScreen.filter.searchPlaceholder")}
          placeholderTextColor={isDarkColorScheme ? "#EDF6F9" : "#023047"}
          autoFocus
          value={formData?.search}
          onChange={(text) => {
            debounceSetFormData({ ...formData, search: text });
          }}
          clear={formData?.search !== ""}
          onClear={() => {
            debounceSetFormData({ ...formData, search: "" });
          }}
        />
        <CategoryPicker
          label={t("addFriendScreen.filter.preferredGender")}
          name="preferredGenders"
          value={formData?.preferredGenders}
          onChange={(value) => {
            debounceSetFormData({
              ...formData,
              preferredGenders: formData?.preferredGenders?.includes(value)
                ? formData?.preferredGenders?.filter((item) => item !== value)
                : formData?.preferredGenders?.length
                ? [...formData?.preferredGenders, value]
                : [value],
            });
          }}
          items={gender}
          multiple
          clear
          onClear={() => {
            debounceSetFormData({ ...formData, preferredGenders: [] });
          }}
        />

        {/* <Collapse
        label={t("addFriendScreen.filter.lookingFor")}
        items={lookingFor}
        value={formData?.lookingFor}
        onChange={(value) => {
          debounceSetFormData({
            ...formData,
            lookingFor: formData?.lookingFor?.includes(value)
              ? formData?.lookingFor?.filter((item) => item !== value)
              : formData?.lookingFor?.length
              ? [...formData?.lookingFor, value]
              : [value],
          });
        }}
        name="lookingFor"
        multiple={true}
        clear
        onClear={() => {
          debounceSetFormData({ ...formData, lookingFor: [] });
        }}
      /> */}
        <Input
          containerStyle="w-full"
          inputStyle="h-12"
          placeholder={t("addFriendScreen.filter.nationality")}
          value={formData.nationality}
          onPress={() => {
            setShowNationality(!showNationality);
          }}
          autoCapitalize="none"
          type={"number"}
          clear
          onClear={() => {
            debounceSetFormData({ ...formData, nationality: [] });
          }}
        />
        <CountryPicker
          visible={showNationality}
          withAlphaFilter={true}
          withFilter={true}
          withFlag={true}
          theme={DARK_THEME}
          value={formData?.nationality}
          onSelect={(e) => {
            const updatedNationality = formData?.nationality?.includes(
              isoCountryToEnglish?.[e.cca2]
            )
              ? formData?.nationality?.filter(
                  (n) => n !== isoCountryToEnglish?.[e.cca2]
                )
              : formData?.nationality
              ? [...formData?.nationality, isoCountryToEnglish?.[e.cca2]]
              : [isoCountryToEnglish?.[e.cca2]];

            debounceSetFormData({
              ...formData,
              nationality: updatedNationality,
            });
            setShowNationality(!showNationality);
          }}
          placeholder={""}
        />
        <View className={`flex items-start w-full mb-6`}>
          <View className={`flex-row justify-between w-full`}>
            <Input
              containerStyle="flex-1 mr-2 mb-0"
              inputStyle="h-12"
              placeholder={t("addFriendScreen.filter.minAge")}
              type="number"
              value={ageRange[0]}
              onChange={(text) => {
              setAgeRange([
                +text,
                ageRange[1]
              ]);
              }}
              autoCapitalize="none"
              clear={ageRange[0] !== user?.preferredAgeRange?.[0] || ageRange[1] !== user?.preferredAgeRange?.[1]}
              onClear={() => {
                setAgeRange(user?.preferredAgeRange);
                debounceSetFormData({ ...formData, preferredAgeRange: 
                  user?.preferredAgeRange
                 });
              }}
            />
            <Input
              containerStyle="flex-1 ml-2 mb-0"
              inputStyle="h-12"
              placeholder={t("addFriendScreen.filter.maxAge")}
              type="number"
              value={ageRange[1]}
              onChange={(text) => {
                setAgeRange([
                  ageRange[0],
                  +text
                ]);
              }}
              autoCapitalize="none"
            />
          </View>
        </View>

        <View className={`flex items-start w-full`}>
          <CategoryPicker
            label={t("addFriendScreen.filter.location.label")}
            items={[
              {
                name: t("addFriendScreen.filter.location.nearby"),
                _id: "nearby",
              },
              {
                name: t("addFriendScreen.filter.location.worldwide"),
                _id: "worldwide",
              },
              {
                name: t("addFriendScreen.filter.location.country"),
                _id: "country",
              },
            ]}
            value={formData.locationType}
            onChange={(e) => {
              debounceSetFormData({
                ...formData,
                locationType: e,
                location: user?.location ? user?.location : {},
              });
            }}
            name="location"
            multiple={false}
            clear
            onClear={() => {
              debounceSetFormData({
                ...formData,
                locationType: "",
              });
            }}
          />
        </View>

        {formData.locationType === "nearby" && (
          <View className={`flex items-start w-full`}>
            <Text
              className="ml-2 text-base text-placehoder dark:text-papaya"
            >
              {t("addFriendScreen.filter.distance")} :{" "}
              {formData.preferredDistance} km
            </Text>
            <View className={`flex items-center justify-center w-full`}>
              <Slider
                name={"preferredDistance"}
                min={5}
                max={1500}
                valueLabelFormat={(value) => `${value} km`}
                size="small"
                value={formData.preferredDistance}
                onChange={(value) => {
                  logger.debug("User location", { location: user?.location });
                  if (
                    user?.location?.coordinates[0] === 0 ||
                    user?.location?.coordinates[1] === 0 ||
                    user?.location?.coordinates[0] === null ||
                    user?.location?.coordinates[1] === null
                  ) {
                    logger.warn("Please set your location before adjusting the preferred distance.");
                    setShowLoactionRedirection(true);
                    setShowFilter(false);
                    // setShowFilter(false);
                  } else {
                    debounceSetFormData({
                      ...formData,
                      preferredDistance: value,
                    });
                  }
                }}
                showValue={false}
                disabled={
                  formData.locationType === "worldwide" ||
                  formData.locationType === "country"
                }
              />
            </View>
          </View>
        )}
        {formData.locationType === "country" && (
          <Input
            containerStyle="w-full"
            inputStyle="h-12"
            placeholder={t("addFriendScreen.filter.country")}
            value={formData.country}
            onPress={() => {
              setShowCountry(!showCountry);
            }}
            autoCapitalize="none"
            type={"number"}
            clear
            onClear={() => {
              debounceSetFormData({ ...formData, country: [] });
            }}
          />
        )}
        <CountryPicker
          visible={showCountry}
          withAlphaFilter={true}
          withFilter={true}
          withFlag={true}
          theme={DARK_THEME}
          value={formData?.country}
          onSelect={(e) => {
            const updatedCountry = formData?.country?.includes(
              isoCountryToEnglish?.[e.cca2]
            )
              ? formData?.country?.filter(
                  (n) => n !== isoCountryToEnglish?.[e.cca2]
                )
              : formData?.country
              ? [...formData?.country, isoCountryToEnglish?.[e.cca2]]
              : [isoCountryToEnglish?.[e.cca2]];

            debounceSetFormData({ ...formData, country: updatedCountry });
            setShowCountry(!showCountry);
          }}
          placeholder={""}
        />

        <>
          <CategoryPicker
            label={t("addFriendScreen.filter.maritalStatus")}
            items={maritalStatus}
            value={formData?.maritalStatus}
            onChange={(value) => {
              debounceSetFormData({
                ...formData,
                maritalStatus: formData?.maritalStatus?.includes(value)
                  ? formData?.maritalStatus?.filter((item) => item !== value)
                  : formData?.maritalStatus?.length
                  ? [...formData?.maritalStatus, value]
                  : [value],
              });
            }}
            name="maritalStatus"
            clear
            multiple
            onClear={() => {
              debounceSetFormData({ ...formData, maritalStatus: [] });
            }}
          />

          <CategoryPicker
            label={t("addFriendScreen.filter.preferredCommunication")}
            items={preferredCommunications}
            value={formData?.preferredCommunications}
            onChange={(value) => {
              debounceSetFormData({
                ...formData,
                preferredCommunications:
                  formData?.preferredCommunications?.includes(value)
                    ? formData?.preferredCommunications?.filter(
                        (item) => item !== value
                      )
                    : formData?.preferredCommunications?.length
                    ? [...formData?.preferredCommunications, value]
                    : [value],
              });
            }}
            name="preferredCommunications"
            multiple={true}
            clear
            onClear={() => {
              debounceSetFormData({ ...formData, preferredCommunications: [] });
            }}
          />
   

          <CategoryPicker
            label={t("addFriendScreen.filter.zodiacSign")}
            items={zodiacSign}
            value={formData?.zodiacSign}
            onChange={(value) => {
              debounceSetFormData({
                ...formData,
                zodiacSign: formData?.zodiacSign?.includes(value)
                  ? formData?.zodiacSign?.filter((item) => item !== value)
                  : formData?.zodiacSign?.length
                  ? [...formData?.zodiacSign, value]
                  : [value],
              });
            }}
            name="zodiacSign"
            multiple
            clear
            onClear={() => {
              debounceSetFormData({ ...formData, zodiacSign: [] });
            }}
          />
          <CategoryPicker
            label={t("addFriendScreen.filter.personalityType")}
            items={personalityType}
            value={formData?.personalityType}
            onChange={(value) => {
              debounceSetFormData({
                ...formData,
                personalityType: formData?.personalityType?.includes(value)
                  ? formData?.personalityType?.filter((item) => item !== value)
                  : formData?.personalityType?.length
                  ? [...formData?.personalityType, value]
                  : [value],
              });
            }}
            name="personalityType"
            multiple={true}
            clear
            onClear={() => {
              debounceSetFormData({ ...formData, personalityType: [] });
            }}
          />

<CategoryPicker
          label={t("addFriendScreen.filter.smoking")}
          items={smoking}
          value={formData?.smoking}
          onChange={(value) => {
            debounceSetFormData({
              ...formData,
              smoking: formData?.smoking?.includes(value)
                ? formData?.smoking?.filter((item) => item !== value)
                : formData?.smoking?.length
                ? [...formData?.smoking, value]
                : [value],
            });
          }}
          name="smoking"
          multiple
          clear
          onClear={() => {
            debounceSetFormData({ ...formData, smoking: [] });
          }}
        />
        <CategoryPicker
          label={t("addFriendScreen.filter.drinking")}
          items={drinking}
          value={formData?.drinking}
          onChange={(value) => {
            debounceSetFormData({
              ...formData,
              drinking: formData?.drinking?.includes(value)
                ? formData?.drinking?.filter((item) => item !== value)
                : formData?.drinking?.length
                ? [...formData?.drinking, value]
                : [value],
            });
          }}
          name="drinking"
          multiple
          clear
          onClear={() => {
            debounceSetFormData({ ...formData, drinking: [] });
          }}
        />
          <CategoryPicker
            label={t("addFriendScreen.filter.languages")}
            items={languages}
            value={formData?.languages}
            valueKey="name"
            onChange={(value) => {
              debounceSetFormData({
                ...formData,
                languages: formData?.languages?.includes(value)
                  ? formData?.languages?.filter((item) => item !== value)
                  : formData?.languages?.length
                  ? [...formData?.languages, value]
                  : [value],
              });
            }}
            name="languages"
            multiple={true}
            clear
            onClear={() => {
              debounceSetFormData({ ...formData, languages: [] });
            }}
          />
          <CategoryPicker
            label={t("addFriendScreen.filter.education")}
            items={education}
            value={formData?.education}
            onChange={(value) => {
              debounceSetFormData({
                ...formData,
                education: formData?.education?.includes(value)
                  ? formData?.education?.filter((item) => item !== value)
                  : formData?.education?.length
                  ? [...formData?.education, value]
                  : [value],
              });
            }}
            name="education"
            multiple
            clear
            onClear={() => {
              debounceSetFormData({ ...formData, education: [] });
            }}
          />
          <CategoryPicker
            mb="mb-0"
            label={t("addFriendScreen.filter.interests")}
            items={displayedInterests}
            value={formData?.interests}
            valueKey="name"
            onChange={(value) => {
              debounceSetFormData({
                ...formData,
                interests: formData?.interests?.includes(value)
                  ? formData?.interests?.filter((item) => item !== value)
                  : formData?.interests?.length
                  ? [...formData?.interests, value]
                  : [value],
              });
            }}
            name="interests"
            multiple={true}
            clear
            onClear={() => {
              debounceSetFormData({ ...formData, interests: [] });
            }}
          />

<CategoryPicker
          label={t("addFriendScreen.filter.religion")}
          items={religion}
          value={formData?.religion}
          onChange={(value) => {
            debounceSetFormData({
              ...formData,
              religion: formData?.religion?.includes(value)
                ? formData?.religion?.filter((item) => item !== value)
                : formData?.religion?.length
                ? [...formData?.religion, value]
                : [value],
            });
          }}
          name="religion"
          multiple
          clear
          onClear={() => {
            debounceSetFormData({ ...formData, religion: [] });
          }}
        />
          {interests.length > initialDisplayCount && (
            <TouchableOpacity
              onPress={() => setShowMore(!showMore)}
              className={`mt-2`}
            >
              <Text
                className="underline text-placehoder dark:text-papaya"
              >
                {showMore
                  ? t("addFriendScreen.filter.showLess")
                  : t("addFriendScreen.filter.showMore")}
              </Text>
            </TouchableOpacity>
          )}
        </>
      </ScrollView>
      <View className="w-full px-1 pt-2 pb-1">
        <Button
          onPress={
            onApply ||
            (() => {
              setShowFilter(false);
            })
          }
          w="w-full"
          mb="mb-2"
          title={t("addFriendScreen.filter.apply")}
          isLoading={loading}
        />
      </View>
      </View>
    </Popup>
  );
};

export default ShowFilterPopup;