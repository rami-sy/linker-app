import React, { useCallback } from "react";
import Popup from "../popup";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { deleteAccount } from "../../api/me";
import { router } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";

const DeleteAccountPopup = ({ showDeleteAccount, setShowDeleteAccount }) => {
  const { t } = useTranslation();
  const handleDeleteAccount = useCallback(async () => {
    try {
      const res = await deleteAccount();
      if (res.type === "success") {
        setShowDeleteAccount(false);
        setTimeout(() => {
          router.push("/welcome?forceLogout=true");
        }, 1000);
      }
    } catch (error) {
      console.log({ error });
    }
  }, [router]);
  const { isDarkColorScheme } = useColorScheme();
  return (
    <Popup
      showModal={showDeleteAccount}
      setShowModal={setShowDeleteAccount}
      onClick={handleDeleteAccount}
      onCancel={() => setShowDeleteAccount(false)}
      title={t("user.deleteAccount") || "Delete Account"}
    >
      <Text className="text-base text-center text-slate-800 dark:text-slate-200">
        {t("user.areYouSureDeleteAccount")}
      </Text>
      <Text className="mt-2 text-base text-center text-slate-800 dark:text-slate-200">
        {t("user.actionCannotBeUndone")}
      </Text>
    </Popup>
  );
};

export default DeleteAccountPopup;
