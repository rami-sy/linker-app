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

const CallSettingsScreen = () => {
  const { t } = useTranslation();
  const { user } = useSelector((state) => state.users);
  const [formData, setFormData] = React.useState({});

  useEffect(() => {
    // Convert string values to arrays for backward compatibility
    const callSettings = user?.privacySettings?.callSettings || {};
    const convertedSettings = {};
    
    Object.keys(callSettings).forEach((key) => {
      if (key.endsWith("AllowedUsers")) {
        convertedSettings[key] = callSettings[key];
      } else {
        // Convert string to array if needed
        const value = callSettings[key];
        convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
      }
    });

    setFormData(convertedSettings);

    return () => {
      setFormData({});
    };
  }, [user?.privacySettings?.callSettings]);

  const dispatch = useDispatch();

  const onClick = async () => {
    try {
      const res = await updateProfile({
        privacySettings: {
          ...user.privacySettings,
          callSettings: formData,
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
      name: t("callSettingsScreen.items.everyone"),
      _id: "everyone",
    },
    {
      name: t("callSettingsScreen.items.admin"),
      _id: "admin",
    },
    {
      name: t("callSettingsScreen.items.moderator"),
      _id: "moderator",
    },
    {
      name: t("callSettingsScreen.items.friends"),
      _id: "friends",
    },
    {
      name: t("callSettingsScreen.items.specific"),
      _id: "specific",
    },
    {
      name: t("callSettingsScreen.items.noOne"),
      _id: "noOne",
    },
  ];
  const { isDarkColorScheme } = useColorScheme();
  const menuOptions = React.useMemo(
    () => getPrivacyMenuOptions("call-settings", t, isDarkColorScheme),
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
              <Text className={`text-sm font-semibold flex-1 ${activeSection?.selected ? "text-white" : "text-slate-800 dark:text-slate-100"}`}>{activeSection?.name || t("callSettingsScreen.title")}</Text>
              <View className="ml-2"><FeIcon name="chevron-down" size={18} color={activeSection?.selected ? "#f6f8f9" : (isDarkColorScheme ? "#94a3b8" : "#475569")} /></View>
            </View>
          </ContextMenu>
        </View>
      }
    >
      <View className="w-full flex-1 px-4 pt-1">
        <ScrollView contentContainerStyle={{ marginTop: 8, marginBottom: 8 }} className="mb-2">
        <CategoryPicker
          label={t("callSettingsScreen.fields.screenShare")}
          items={items}
          value={formData?.screenShare || []}
          onChange={(value) => {
            const currentValue = formData?.screenShare || [];
            let updatedValue;
            
            // Special logic for "everyone" and "noOne"
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
              // For other options, remove "everyone" and "noOne" first
              let filtered = currentValue.filter(item => item !== "everyone" && item !== "noOne");
              updatedValue = filtered.includes(value)
                ? filtered.filter((item) => item !== value)
                : [...filtered, value];
            }
            
            setFormData({
              ...formData,
              screenShare: updatedValue,
            });
          }}
          name="screenShare"
          multiple={true}
        />
        <CategoryPicker
          label={t("callSettingsScreen.fields.recording")}
          items={items}
          value={formData?.recording || []}
          onChange={(value) => {
            const currentValue = formData?.recording || [];
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
              recording: updatedValue,
            });
          }}
          name="recording"
          multiple={true}
        />
        <CategoryPicker
          label={t("callSettingsScreen.fields.callTransfer")}
          items={items}
          value={formData?.callTransfer || []}
          onChange={(value) => {
            const currentValue = formData?.callTransfer || [];
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
              callTransfer: updatedValue,
            });
          }}
          name="callTransfer"
          multiple={true}
        />
        <CategoryPicker
          label={t("callSettingsScreen.fields.liveStream")}
          items={items}
          value={formData?.liveStream || []}
          onChange={(value) => {
            const currentValue = formData?.liveStream || [];
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
              liveStream: updatedValue,
            });
          }}
          name="liveStream"
          multiple={true}
        />
        </ScrollView>
        <Button label={t("callSettingsScreen.saveButton")} w="w-full" h="h-12" onPress={onClick} mb="mb-0" />
      </View>
    </Layout>
  );
};

export default CallSettingsScreen;







