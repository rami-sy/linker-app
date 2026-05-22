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

const ChatSettingsScreen = () => {
  const { t } = useTranslation();
  const { user } = useSelector((state) => state.users);
  const [formData, setFormData] = React.useState({});

  useEffect(() => {
    // Convert string values to arrays for backward compatibility
    const chatSettings = user?.privacySettings?.chatSettings || {};
    const convertedSettings = {};
    
    Object.keys(chatSettings).forEach((key) => {
      if (key.endsWith("AllowedUsers")) {
        convertedSettings[key] = chatSettings[key];
      } else {
        // Convert string to array if needed
        const value = chatSettings[key];
        convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
      }
    });

    setFormData(convertedSettings);

    return () => {
      setFormData({});
    };
  }, [user?.privacySettings?.chatSettings]);

  const dispatch = useDispatch();

  const onClick = async () => {
    try {
      const res = await updateProfile({
        privacySettings: {
          ...user.privacySettings,
          chatSettings: formData,
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
      name: t("chatSettingsScreen.items.everyone"),
      _id: "everyone",
    },
    {
      name: t("chatSettingsScreen.items.admin"),
      _id: "admin",
    },
    {
      name: t("chatSettingsScreen.items.moderator"),
      _id: "moderator",
    },
    {
      name: t("chatSettingsScreen.items.friends"),
      _id: "friends",
    },
    {
      name: t("chatSettingsScreen.items.specific"),
      _id: "specific",
    },
    {
      name: t("chatSettingsScreen.items.noOne"),
      _id: "noOne",
    },
  ];
  const { isDarkColorScheme } = useColorScheme();
  const menuOptions = React.useMemo(
    () => getPrivacyMenuOptions("chat-settings", t, isDarkColorScheme),
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
          <ContextMenu options={menuOptions} placement="bottom" width={260} menuClassName="rounded-2xl shadow-lg">
            <View className={`flex-row items-center h-12 px-4 py-3 rounded-2xl ${activeSection?.selected ? "bg-[#0a97b9]" : "bg-white dark:bg-[#171b25]"}`} style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: activeSection?.selected ? (isDarkColorScheme ? 0.35 : 0.18) : (isDarkColorScheme ? 0.22 : 0.08), shadowRadius: activeSection?.selected ? 12 : 8, elevation: activeSection?.selected ? 8 : 4 }}>
              {activeSection?.icon && <View className="mr-2">{React.cloneElement(activeSection.icon, { size: 20, color: activeSection.selected ? "#f6f8f9" : (isDarkColorScheme ? "#94a3b8" : "#475569") })}</View>}
              <Text className={`text-sm font-semibold flex-1 ${activeSection?.selected ? "text-white" : "text-slate-800 dark:text-slate-100"}`}>{activeSection?.name || t("chatSettingsScreen.title")}</Text>
              <View className="ml-2"><FeIcon name="chevron-down" size={18} color={activeSection?.selected ? "#f6f8f9" : (isDarkColorScheme ? "#94a3b8" : "#475569")} /></View>
            </View>
          </ContextMenu>
        </View>
      }
    >
      <View className="w-full flex-1 px-4 pt-1">
        <ScrollView contentContainerStyle={{ marginTop: 8, marginBottom: 8 }} className="mb-2">
        <CategoryPicker
          label={t("chatSettingsScreen.fields.videoCall")}
          items={items}
          value={formData?.videoCall || []}
          onChange={(value) => {
            const currentValue = formData?.videoCall || [];
            let updatedValue;
            
            if (value === "everyone") {
              if (currentValue.includes("everyone")) {
                updatedValue = [];
              } else {
                updatedValue = ["everyone"];
              }
            } else if (value === "noOne") {
              if (currentValue.includes("noOne")) {
                updatedValue = [];
              } else {
                updatedValue = ["noOne"];
              }
            } else {
              let filtered = currentValue.filter(item => item !== "everyone" && item !== "noOne");
              updatedValue = filtered.includes(value)
                ? filtered.filter((item) => item !== value)
                : [...filtered, value];
            }
            
            setFormData({
              ...formData,
              videoCall: updatedValue,
            });
          }}
          name="videoCall"
          multiple={true}
        />
        <CategoryPicker
          label={t("chatSettingsScreen.fields.audioCall")}
          items={items}
          value={formData?.audioCall || []}
          onChange={(value) => {
            const currentValue = formData?.audioCall || [];
            let updatedValue;
            
            if (value === "everyone") {
              if (currentValue.includes("everyone")) {
                updatedValue = [];
              } else {
                updatedValue = ["everyone"];
              }
            } else if (value === "noOne") {
              if (currentValue.includes("noOne")) {
                updatedValue = [];
              } else {
                updatedValue = ["noOne"];
              }
            } else {
              let filtered = currentValue.filter(item => item !== "everyone" && item !== "noOne");
              updatedValue = filtered.includes(value)
                ? filtered.filter((item) => item !== value)
                : [...filtered, value];
            }
            
            setFormData({
              ...formData,
              audioCall: updatedValue,
            });
          }}
          name="audioCall"
          multiple={true}
        />
        <CategoryPicker
          label={t("chatSettingsScreen.fields.sendMedia")}
          items={items}
          value={formData?.sendMedia || []}
          onChange={(value) => {
            const currentValue = formData?.sendMedia || [];
            let updatedValue;
            
            if (value === "everyone") {
              if (currentValue.includes("everyone")) {
                updatedValue = [];
              } else {
                updatedValue = ["everyone"];
              }
            } else if (value === "noOne") {
              if (currentValue.includes("noOne")) {
                updatedValue = [];
              } else {
                updatedValue = ["noOne"];
              }
            } else {
              let filtered = currentValue.filter(item => item !== "everyone" && item !== "noOne");
              updatedValue = filtered.includes(value)
                ? filtered.filter((item) => item !== value)
                : [...filtered, value];
            }
            
            setFormData({
              ...formData,
              sendMedia: updatedValue,
            });
          }}
          name="sendMedia"
          multiple={true}
        />
        <CategoryPicker
          label={t("chatSettingsScreen.fields.sendFiles")}
          items={items}
          value={formData?.sendFiles || []}
          onChange={(value) => {
            const currentValue = formData?.sendFiles || [];
            let updatedValue;
            
            if (value === "everyone") {
              if (currentValue.includes("everyone")) {
                updatedValue = [];
              } else {
                updatedValue = ["everyone"];
              }
            } else if (value === "noOne") {
              if (currentValue.includes("noOne")) {
                updatedValue = [];
              } else {
                updatedValue = ["noOne"];
              }
            } else {
              let filtered = currentValue.filter(item => item !== "everyone" && item !== "noOne");
              updatedValue = filtered.includes(value)
                ? filtered.filter((item) => item !== value)
                : [...filtered, value];
            }
            
            setFormData({
              ...formData,
              sendFiles: updatedValue,
            });
          }}
          name="sendFiles"
          multiple={true}
        />
        </ScrollView>
        <Button label={t("chatSettingsScreen.saveButton")} w="w-full" h="h-12" onPress={onClick} mb="mb-0" />
      </View>
    </Layout>
  );
};

export default ChatSettingsScreen;



