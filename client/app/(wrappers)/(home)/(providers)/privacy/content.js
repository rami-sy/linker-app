import { ScrollView, View, Text } from "react-native";
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

const ContentScreen = () => {
  const { t } = useTranslation();
  const { user } = useSelector((state) => state.users);
  const [formData, setFormData] = React.useState({});

  useEffect(() => {
    setFormData({
      ...formData,
      ...user?.privacySettings?.content,
    });

    return () => {
      setFormData({});
    };
  }, [user?.privacySettings?.content]);

  const dispatch = useDispatch();

  const onClick = async () => {
    try {
      const res = await updateProfile({
        privacySettings: {
          ...user.privacySettings,
          content: formData,
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
    () => getPrivacyMenuOptions("content", t, isDarkColorScheme),
    [t, isDarkColorScheme]
  );
  const activeSection = menuOptions.find((o) => o.selected);

  return (
    <Layout
      back
      onBack={() => router.push("/user")}
      pb="pb-4"
      h="h-auto"
      className="items-stretch flex-1 relative w-full md:w-1/2 lg:w-1/2 bg-[#dee4e6] dark:bg-[#12141b]"
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
                shadowOpacity: activeSection?.selected
                  ? isDarkColorScheme ? 0.35 : 0.18
                  : isDarkColorScheme ? 0.22 : 0.08,
                shadowRadius: activeSection?.selected ? 12 : 8,
                elevation: activeSection?.selected ? 8 : 4,
              }}
            >
              {activeSection && activeSection.icon && (
                <View className="mr-2">
                  {React.cloneElement(activeSection.icon, {
                    size: 20,
                    color: activeSection.selected ? "#f6f8f9" : (isDarkColorScheme ? "#94a3b8" : "#475569"),
                  })}
                </View>
              )}
              <Text
                className={`text-sm font-semibold flex-1 ${
                  activeSection?.selected ? "text-white" : "text-slate-800 dark:text-slate-100"
                }`}
              >
                {activeSection?.name || t("contentScreen.title")}
              </Text>
              <View className="ml-2">
                <FeIcon
                  name="chevron-down"
                  size={18}
                  color={activeSection?.selected ? "#f6f8f9" : (isDarkColorScheme ? "#94a3b8" : "#475569")}
                />
              </View>
            </View>
          </ContextMenu>
        </View>
      }
    >
      <View className="w-full flex-1 px-4 pt-1">
        <ScrollView
          contentContainerStyle={{ marginTop: 8, marginBottom: 8 }}
          className="mb-2"
        >
        <CategoryPicker
          label={t("contentScreen.fields.posts")}
          items={items}
          value={formData?.posts}
          onChange={(value) => {
            setFormData({
              ...formData,
              posts: value,
            });
          }}
          name="posts"
        />
        <CategoryPicker
          label={t("contentScreen.fields.images")}
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
          label={t("contentScreen.fields.videos")}
          items={items}
          value={formData?.videos}
          onChange={(value) => {
            setFormData({
              ...formData,
              videos: value,
            });
          }}
          name="videos"
        />
        <CategoryPicker
          label={t("contentScreen.fields.stories")}
          items={items}
          value={formData?.stories}
          onChange={(value) => {
            setFormData({
              ...formData,
              stories: value,
            });
          }}
          name="stories"
        />
        <CategoryPicker
          label={t("contentScreen.fields.likedPages")}
          items={items}
          value={formData?.likedPages}
          onChange={(value) => {
            setFormData({
              ...formData,
              likedPages: value,
            });
          }}
          name="likedPages"
        />
        </ScrollView>
        <Button
          label={t("contentScreen.saveButton")}
          w="w-full"
          h="h-12"
          onPress={onClick}
          mb="mb-0"
        />
      </View>
    </Layout>
  );
};

export default ContentScreen;
