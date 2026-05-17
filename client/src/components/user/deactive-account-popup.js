import React, { useCallback } from "react";
import Popup from "../popup";
import { Text } from "react-native";
import { deActiveAccount } from "../../api/me";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";

const DeActiveAccountPopup = ({
  showDeActiveAccount,
  setShowDeActiveAccount,
}) => {
  const { t } = useTranslation();

  const handleDeActiveAccount = useCallback(async () => {
    try {
      const res = await deActiveAccount();
      if (res.type === "success") {
        setShowDeActiveAccount(false);
        setTimeout(() => {
          router.push("/welcome?forceLogout=true");
        }, 1000);
      }
    } catch (error) {
      console.log({ error });
    }
  }, [router]);

  return (
    <Popup
      showModal={showDeActiveAccount}
      setShowModal={setShowDeActiveAccount}
      onClick={handleDeActiveAccount}
      onCancel={() => setShowDeActiveAccount(false)}
      title={t("user.deactivateAccount") || "Deactivate Account"}
    >
      <Text className="text-base text-center text-slate-800 dark:text-slate-200">
        {t("user.areYouSureDeactivateAccount")}
      </Text>
      <Text className="mt-2 text-base text-center text-slate-800 dark:text-slate-200">
        {t("user.deactivateWarning")}
      </Text>
      <Text className="mt-2 text-base text-center text-slate-800 dark:text-slate-200">
        {t("user.reactivateInfo")}
      </Text>
    </Popup>
  );
};

export default DeActiveAccountPopup;
