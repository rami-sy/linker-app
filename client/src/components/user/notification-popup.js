import React, { useEffect, useState } from "react";
import Popup from "../popup";
import { Text } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import {
  resetForm,
  selectFormData,
  setFormData,
  setLoading,
} from "../../redux/formSlice";
import { getMe, updateProfile } from "../../api/me";
import { setMe } from "../../redux/userSlice";
import { useTranslation } from "react-i18next";
import Checkbox from "../checkbox";
import { useColorScheme } from "../../../lib/useColorScheme";

const NotificationPopup = ({
  showNotificationPopup,
  setShowNotificationPopup,
}) => {
  const { user } = useSelector((state) => state.users);
  const { t } = useTranslation();

  const [notifications, setNotifications] = useState(
    user?.settings?.notifications
  ); // اجلب حالة الإشعارات من بيانات المستخدم

  const formData = useSelector(selectFormData);
  const dispatch = useDispatch();
  useEffect(() => {
    if (user) {
      dispatch(setFormData(user));
    }

    return () => {
      dispatch(resetForm());
    };
  }, [user, dispatch]);

  const toggleNotifications = async (key, value) => {
    setNotifications({
      ...notifications,
      [key]: value,
    });
    dispatch(setLoading(true));

    try {
      const res = await updateProfile({
        ...formData,
        settings: {
          notifications: {
            ...notifications,
            [key]: value,
          },
        },
      });

      if (res.type === "success") {
        const data = await getMe();
        if (data.type === "success") {
          dispatch(setMe(data.data));
        }
      }
      dispatch(setLoading(false));
    } catch (error) {
      dispatch(setLoading(false));

      console.error("Failed to update notifications settings", error);
    }
  };
  const { isDarkColorScheme } = useColorScheme();
  return (
    <Popup
      showModal={showNotificationPopup}
      setShowModal={setShowNotificationPopup}
      onClick={toggleNotifications} // التبديل عند الضغط
      onCancel={() => setShowNotificationPopup(false)}
      w="w-9/12"
      withActions={false}
      title={t("notifications.title") || "Notifications"}
    >
      <Text
        className="mb-3 text-base text-center text-slate-800 dark:text-slate-200"
      >
        {t("notifications.title")}
      </Text>
      <Checkbox
        value={notifications?.friendRequests}
        onChange={
          (value) => toggleNotifications("friendRequests", value) // تبديل الإشعارات عند الضغط
        }
        placeholder={t("notifications.friendRequests")}
        mb="mb-2"
        w="w-full"
      />

      <Checkbox
        value={notifications?.messages}
        onChange={
          (value) => toggleNotifications("messages", value) // تبديل الإشعارات عند الضغط
        }
        placeholder={t("notifications.messages")}
        mb="mb-2"
        w="w-full"
      />
      <Checkbox
        value={notifications?.likes}
        onChange={
          (value) => toggleNotifications("likes", value) // تبديل الإشعارات عند الضغط
        }
        placeholder={t("notifications.likes")}
        mb="mb-2"
        w="w-full"
      />
    </Popup>
  );
};

export default NotificationPopup;
