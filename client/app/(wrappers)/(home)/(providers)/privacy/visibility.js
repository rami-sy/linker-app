import { ScrollView, Text, View } from "react-native";
import React, { useEffect } from "react";
import Layout from "../../../../../src/components/layout";
import ContextMenu from "../../../../../src/components/context-menu";
import FeIcon from "react-native-vector-icons/Feather";
import Button from "../../../../../src/components/button";
import { getMe, updateProfile } from "../../../../../src/api/me";
import { useDispatch, useSelector } from "react-redux";
import { setMe } from "../../../../../src/redux/userSlice";
import CategoryPicker from "../../../../../src/components/category-picker";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";
import { getPrivacyMenuOptions } from "./privacy-menu-options";

const VisibilityScreen = () => {
  const { t } = useTranslation();
  const { user } = useSelector((state) => state.users);
  const [formData, setFormData] = React.useState({});

  useEffect(() => {
    setFormData({
      ...formData,
      ...user?.privacySettings?.visibility,
    });

    return () => {
      setFormData({});
    };
  }, [user?.privacySettings?.visibility]);

  const dispatch = useDispatch();

  const onClick = async () => {
    try {
      const res = await updateProfile({
        privacySettings: {
          ...user.privacySettings,
          visibility: formData,
        },
      });
      if (res.type === "success") {
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
        }
      }
    } catch (error) {
      console.log({ error });
    }
  };

  const items = [
    {
      name: t("visibilityScreen.items.everyone"),
      _id: "everyone",
    },
    {
      name: t("visibilityScreen.items.friends"),
      _id: "friends",
    },
    {
      name: t("visibilityScreen.items.noOne"),
      _id: "noOne",
    },
  ];
  const { isDarkColorScheme } = useColorScheme();
  const menuOptions = React.useMemo(
    () => getPrivacyMenuOptions("visibility", t, isDarkColorScheme),
    [t, isDarkColorScheme]
  );
  const activeSection = menuOptions.find((o) => o.selected);

  return (
    <Layout
      back
      onBack={() => router.push("/user")}
      pb="pb-4"
      h="h-auto"
      className="items-stretch flex-1 relative w-full linker-w bg-[#dee4e6] dark:bg-[#12141b]"
      navBar={
        <View className="flex-row flex-1 items-center justify-end w-full gap-x-3">
          <ContextMenu
            options={menuOptions}
            placement="bottom"
            width={260}
            menuClassName="rounded-2xl shadow-lg"
          >
            <View
              className={`flex-row items-center h-12 px-4 py-3 rounded-2xl ${
                activeSection?.selected
                  ? "bg-[#0a97b9]"
                  : "bg-white dark:bg-[#171b25]"
              }`}
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: activeSection?.selected ? (isDarkColorScheme ? 0.35 : 0.18) : (isDarkColorScheme ? 0.22 : 0.08),
                shadowRadius: activeSection?.selected ? 12 : 8,
                elevation: activeSection?.selected ? 8 : 4,
              }}
            >
              {activeSection?.icon && (
                <View className="mr-2">
                  {React.cloneElement(activeSection.icon, {
                    size: 20,
                    color: activeSection.selected ? "#f6f8f9" : (isDarkColorScheme ? "#94a3b8" : "#475569"),
                  })}
                </View>
              )}
              <Text className={`text-sm font-semibold flex-1 ${activeSection?.selected ? "text-white" : "text-slate-800 dark:text-slate-100"}`}>
                {activeSection?.name || t("visibilityScreen.title")}
              </Text>
              <View className="ml-2">
                <FeIcon name="chevron-down" size={18} color={activeSection?.selected ? "#f6f8f9" : (isDarkColorScheme ? "#94a3b8" : "#475569")} />
              </View>
            </View>
          </ContextMenu>
        </View>
      }
    >
      <View className="w-full flex-1 px-4 pt-1">
        <ScrollView contentContainerStyle={{ marginTop: 8, marginBottom: 8 }} className="mb-2">
        <CategoryPicker
          label={t("visibilityScreen.fields.about")}
          items={items}
          value={formData?.bio}
          onChange={(value) => {
            setFormData({
              ...formData,
              bio: value,
            });
          }}
          name="bio"
        />
        <CategoryPicker
          label={t("visibilityScreen.fields.images")}
          items={items}
          value={formData?.images}
          onChange={(value) => {
            setFormData({
              ...formData,
              images: value,
            });
          }}
          name="images"
        />
        <CategoryPicker
          label={t("visibilityScreen.fields.location")}
          items={items}
          value={formData?.location}
          onChange={(value) => {
            setFormData({
              ...formData,
              location: value,
            });
          }}
          name="location"
        />
        <CategoryPicker
          label={t("visibilityScreen.fields.email")}
          items={items}
          value={formData?.email}
          onChange={(value) => {
            setFormData({
              ...formData,
              email: value,
            });
          }}
          name="email"
        />
        <CategoryPicker
          label={t("visibilityScreen.fields.phoneNumber")}
          items={items}
          value={formData?.phoneNumber}
          onChange={(value) => {
            setFormData({
              ...formData,
              phoneNumber: value,
            });
          }}
          name="phoneNumber"
        />
        <CategoryPicker
          label={t("visibilityScreen.fields.fullName")}
          items={items}
          value={formData?.fullName}
          onChange={(value) => {
            setFormData({
              ...formData,
              fullName: value,
            });
          }}
          name="fullName"
        />
        <CategoryPicker
          label={t("visibilityScreen.fields.gender")}
          items={items}
          value={formData?.gender}
          onChange={(value) => {
            setFormData({
              ...formData,
              gender: value,
            });
          }}
          name="gender"
        />
        <CategoryPicker
          label={t("visibilityScreen.fields.age")}
          items={items}
          value={formData?.age}
          onChange={(value) => {
            setFormData({
              ...formData,
              age: value,
            });
          }}
          name="age"
        />
        <CategoryPicker
          label={t("visibilityScreen.fields.nationality")}
          items={items}
          value={formData?.nationality}
          onChange={(value) => {
            setFormData({
              ...formData,
              nationality: value,
            });
          }}
          name="nationality"
        />

        {/* profileInfo */}
        <CategoryPicker
          label={t("visibilityScreen.fields.profileInfo")}
          items={items}
          value={formData?.profileInfo}
          onChange={(value) => {
            setFormData({
              ...formData,
              profileInfo: value,
            });
          }}
          name="profileInfo"
        />
        <Text className="text-sm text-gray-500">
          {t("visibilityScreen.profileInfoDescription")}
        </Text>
        </ScrollView>
        <Button label={t("visibilityScreen.saveButton")} w="w-full" h="h-12" onPress={onClick} mb="mb-0" />
      </View>
    </Layout>
  );
};

export default VisibilityScreen;
