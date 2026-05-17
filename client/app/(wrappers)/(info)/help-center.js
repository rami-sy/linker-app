import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Linking,
  TouchableOpacity,
  I18nManager,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import Input from "../../../src/components/input";
import Button from "../../../src/components/button";
import { router } from "expo-router";
import FeIcon from "react-native-vector-icons/Feather";
import { createReport } from "../../../src/api/me";
import { useColorScheme } from "~/lib/useColorScheme";
import { addAlert } from "../../../src/redux/alertSlice";

const HelpCenter = () => {
  const { isDarkColorScheme } = useColorScheme();
  const textColor = "text-placehoder dark:text-papaya";
  const headerColor = "text-slate-800 dark:text-slate-200";
  const backgroundColor = isDarkColorScheme ? "#12141b" : "#dee4e6";
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const [report, setReport] = useState({
    email: "",
    type: "other",
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    // إرسال التقرير إلى الخادم (أو إلى البريد الإلكتروني)
    try {
      // هنا يمكن إضافة منطق إرسال التقرير عبر API أو بريد إلكتروني
      console.log("Report submitted:", report);

      const payload = {
        ...report,
        type: (report.type || "other").toLowerCase().replace(/\s+/g, "_"),
      };
      const res = await createReport(payload);
      setIsSubmitting(false);
      if (res?.type !== "success") {
        throw new Error(res?.message || "Failed to submit report");
      }
      setReport({ email: "", type: "other", description: "" });
      dispatch(
        addAlert({
          type: "success",
          message: t("helpCenter.submitSuccess", {
            defaultValue: "Report submitted successfully.",
          }),
        })
      );

      // إعلام المستخدم بالنجاح
    } catch (error) {
      console.error("Error submitting report:", error);
      setIsSubmitting(false);
      dispatch(
        addAlert({
          type: "error",
          message: t("helpCenter.submitError", {
            defaultValue:
              "There was an error submitting your report. Please try again.",
          }),
        })
      );
    }
  };

  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <TouchableOpacity
        className={`absolute items-center justify-center mr-3 top-[6px] z-10`}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.push("/welcome");
          }
        }}
      >
        {isRTL ? (
          <FeIcon
            name="chevron-right"
            size={35}
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        ) : (
          <FeIcon
            name="chevron-left"
            size={35}
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        )}
      </TouchableOpacity>
      <ScrollView contentContainerStyle={{ padding: 16, marginTop: 30 }}>
        <Text className={`text-2xl font-bold mb-5 ${headerColor}`}>
          {t("helpCenter.title", { defaultValue: "Help Center" })}
        </Text>

        <Text className={`mb-4 ${textColor}`}>
          {t("helpCenter.description", {
            defaultValue:
              "Please select the type of issue you are facing and provide the details below. Your feedback is important to us.",
          })}
        </Text>

        {/* نوع التقرير */}
        <Input
          value={report.type}
          containerStyle="w-full"
          onChange={(text) => setReport({ ...report, type: text })}
          placeholder={t("helpCenter.typePlaceholder", {
            defaultValue:
              "Report type (spam, abuse, harassment, child_safety, technical, other)",
          })}
        />

        {/* البريد الإلكتروني */}
        <Input
          value={report.email}
          containerStyle="w-full"
          onChange={(text) => setReport({ ...report, email: text })}
          placeholder={t("helpCenter.emailPlaceholder", {
            defaultValue: "Enter your email",
          })}
        />

        {/* وصف المشكلة */}

        <Input
          containerStyle="w-full"
          value={report.description}
          onChange={(text) => setReport({ ...report, description: text })}
          placeholder={t("helpCenter.detailsPlaceholder", {
            defaultValue: "Describe the issue in detail",
          })}
          multiline
          numberOfLines={4}
        />

        {/* زر إرسال التقرير */}
        <Button
          w="w-full"
          label={t("helpCenter.submitButton", { defaultValue: "Submit Report" })}
          onPress={handleSubmit}
          disabled={isSubmitting}
        />

        {/* معلومات الاتصال */}
        <Text className={`text-xl font-bold mb-3 ${headerColor}`}>
          {t("helpCenter.contactTitle", { defaultValue: "Contact Us" })}
        </Text>
        <Text className={`mb-4 ${textColor}`}>
          {t("helpCenter.contactDescription", {
            defaultValue:
              "If you have any further questions or need assistance, please contact us at:",
          })}{" "}
          <Text
            className="font-bold"
            onPress={() => {
              Linking.openURL("mailto:rami@linker.land");
            }}
          >
            rami@linker.land
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
};

export default HelpCenter;
