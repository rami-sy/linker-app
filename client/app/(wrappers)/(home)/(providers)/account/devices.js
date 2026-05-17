import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import React, { useContext, useEffect, useState } from "react";
import Layout from "../../../../../src/components/layout";

import { useTranslation } from "react-i18next"; // استيراد useTranslation
import { router } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import Box from "../../../../../src/components/box";
import { SocketContext } from "../../../../../src/contexts/socket.context";
import { removeDevice } from "../../../../../src/redux/appSlice";
import FeIcon from "react-native-vector-icons/Feather";
import { getItem } from "../../../../../src/utils/localStorage";
import { useColorScheme } from "~/lib/useColorScheme";
import ContextMenu from "../../../../../src/components/context-menu";
import { getAccountMenuOptions } from "./account-menu-options";

const DevicesScreen = () => {
  const { t } = useTranslation(); // استخدام useTranslation
  const { user } = useSelector((state) => state.users);
  const { devices } = useSelector((state) => state.app);
  const { isDarkColorScheme } = useColorScheme();
  const [deviceId, setDeviceId] = useState(null);
  const formatRelativeTime = (value) => {
    const ts = value ? new Date(value).getTime() : null;
    if (!ts || Number.isNaN(ts)) return "";
    const diffMs = ts - Date.now();
    const absSec = Math.abs(Math.round(diffMs / 1000));
    if (absSec < 60) return "just now";
    const units = [
      ["year", 31536000],
      ["month", 2592000],
      ["week", 604800],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ];
    const [unit, seconds] = units.find(([, s]) => absSec >= s) || ["minute", 60];
    const amount = Math.round(diffMs / 1000 / seconds);
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
      amount,
      unit
    );
  };

  const getDeviceType = (type) => {
    switch (type) {
      case "0":
        return "Unknown";
      case "1":
        return "Mobile";
      case "2":
        return "Tablet";
      case "3":
        return "Desktop";
      case "4":
        return "TV";
      default:
        return "Unknown";
    }
  };

  const { socket } = useContext(SocketContext);
  const dispatch = useDispatch();
  const menuOptions = React.useMemo(
    () => getAccountMenuOptions("devices", t, isDarkColorScheme, user),
    [t, isDarkColorScheme, user]
  );
  const activeSection = menuOptions.find((o) => o.selected);
  useEffect(() => {
    const fetchDeviceId = async () => {
      const id = await getItem("deviceId");
      setDeviceId(JSON.parse(id));
    };
    fetchDeviceId();
  }, []);
  return (
    <Layout
      label={t("account.devices.title")} // استخدام الترجمة
      back
      onBack={() => router.push("/user")}
      pb="pb-4"
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
                  ? isDarkColorScheme
                    ? 0.35
                    : 0.18
                  : isDarkColorScheme
                  ? 0.22
                  : 0.08,
                shadowRadius: activeSection?.selected ? 12 : 8,
                elevation: activeSection?.selected ? 8 : 4,
              }}
            >
              {activeSection?.icon && (
                <View className="mr-2">
                  {React.cloneElement(activeSection.icon, {
                    size: 20,
                    color: activeSection.selected
                      ? "#f6f8f9"
                      : isDarkColorScheme
                      ? "#94a3b8"
                      : "#475569",
                  })}
                </View>
              )}
              <Text
                className={`text-sm font-semibold flex-1 ${
                  activeSection?.selected
                    ? "text-white"
                    : "text-slate-800 dark:text-slate-100"
                }`}
                numberOfLines={1}
              >
                {activeSection?.name || t("account.devices.title")}
              </Text>
              <View className="ml-2">
                <FeIcon
                  name="chevron-down"
                  size={18}
                  color={
                    activeSection?.selected
                      ? "#f6f8f9"
                      : isDarkColorScheme
                      ? "#94a3b8"
                      : "#475569"
                  }
                />
              </View>
            </View>
          </ContextMenu>
        </View>
      }
    >
      <View className="w-full flex-1 px-4 pt-1">
        <ScrollView
          contentContainerStyle={{
            marginTop: 8,
            marginBottom: 8,
          }}
          className={`mb-2`}
        >
          {devices
            .filter((device) => !device.forceLogout)
            .map((device) => (
              <View
                key={device._id}
                className={`flex-row items-center justify-between w-full mb-2 ${
                  isDarkColorScheme
                    ? "bg-sec text-papaya"
                    : "bg-[#f6f8f9] text-placehoder"
                } rounded-2xl px-2 h-14 `}
              >
              <Text
                className={`text-sm ${isDarkColorScheme ? "text-papaya" : "text-placehoder"}`}
              >
                {getDeviceType(device.deviceType)} -{" "}
                <Text
                  className={`text-sm ${isDarkColorScheme ? "text-emerald-500" : "text-emerald-600"}`}
                >
                  {device.osName}
                </Text>
                <Text
                  className={`text-xs ${isDarkColorScheme ? "text-papaya" : "text-placehoder"}`}
                >
                  {device.deviceId === deviceId && " (Current)"}
                </Text>
              </Text>

              <View className="flex-row items-center gap-x-3">
                <Text
                  className={`text-xs ${isDarkColorScheme ? "text-papaya" : "text-placehoder"}`}
                >
                  {formatRelativeTime(device.lastLogin)}
                </Text>
                <TouchableOpacity
                  className={`bg-red-500 px-2 py-2 rounded-2xl`}
                  onPress={() => {
                    socket.emit(
                      "disconnectDevice",
                      { _id: device._id },
                      (res) => {
                        console.log({ res });
                        // if (res.type === "success") {
                        //   dispatch(removeDevice(res.data._id));
                        // } else {
                        // }
                      }
                    );
                    dispatch(removeDevice(device._id));

                    if (device.deviceId === deviceId) {
                      socket.emit("userDisconnected", {}, () => {
                        socket.disconnect();
                      });
                      router.push({
                        pathname: "/welcome",
                        params: {
                          forceLogout: true,
                        },
                      });
                    }
                  }}
                >
                  {/* <Text className={`text-sm text-papaya`}>Disconnect</Text> */}
                  <FeIcon name="log-out" size={20} color="white" />
                </TouchableOpacity>
              </View>
              </View>
            ))}
        </ScrollView>
      </View>
      {/* <Button
        disabled={
          Object.keys(errors).length > 0 ||
          isLoading ||
          (!isVerificationStep && user?.phoneNumber === phoneNumber)
        }
        label={
          isVerificationStep
            ? t("account.phoneScreen.buttons.verify") // استخدام الترجمة
            : user?.phoneNumber
            ? t("account.phoneScreen.buttons.changePhoneNumber") // استخدام الترجمة
            : t("account.phoneScreen.buttons.addPhoneNumber") // استخدام الترجمة
        }
        isLoading={isLoading}
        w={"w-full"}
        h={"h-12"}
        onPress={() => {
          isVerificationStep ? onVerify() : onClick();
        }}
        mb="mb-0"
      /> */}
    </Layout>
  );
};

export default DevicesScreen;
