import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";

import Popup from "../popup";
import Input from "../input";
import Button from "../button";
import { addAlert } from "../../redux/alertSlice";
import { createReport } from "../../api/me";

const REPORT_TYPES = [
  "spam",
  "abuse",
  "harassment",
  "impersonation",
  "child_safety",
  "privacy",
  "technical",
  "other",
];

const ReportUserPopup = ({ showModal, setShowModal, room }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [reportType, setReportType] = useState("abuse");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const targetUserId = useMemo(
    () => (room?.isGroup ? null : room?.members?.[0]?._id || null),
    [room?.isGroup, room?.members]
  );

  const onSubmit = async () => {
    if (submitting) return;
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      dispatch(
        addAlert({
          type: "warning",
          message: "Please describe the issue.",
        })
      );
      return;
    }

    setSubmitting(true);
    const res = await createReport({
      type: reportType,
      description: trimmedDescription,
      email: email.trim(),
      targetUser: targetUserId,
      room: room?._id || null,
      meta: {
        source: "chat_header",
        isGroup: !!room?.isGroup,
      },
    });
    setSubmitting(false);

    if (res?.type === "success") {
      dispatch(
        addAlert({
          type: "success",
          message: "Report submitted. Thank you.",
        })
      );
      setDescription("");
      setEmail("");
      setShowModal(false);
      return;
    }

    dispatch(
      addAlert({
        type: "error",
        message: res?.message || t("general.somethingWentWrong"),
      })
    );
  };

  return (
    <Popup
      showModal={showModal}
      setShowModal={setShowModal}
      withActions={false}
      title="Report"
      subtitle="Tell us what happened. This helps moderation review faster."
      w="w-[500px]"
    >
      <View className="w-full">
        <Text className="text-sm text-placehoder dark:text-papaya mb-2">
          Report type
        </Text>
        <View className="flex-row flex-wrap mb-3">
          {REPORT_TYPES.map((type) => {
            const selected = reportType === type;
            return (
              <TouchableOpacity
                key={type}
                onPress={() => setReportType(type)}
                className={`mr-2 mb-2 px-3 py-2 rounded-xl border ${
                  selected
                    ? "bg-rose-500 border-rose-600"
                    : "bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600"
                }`}
              >
                <Text
                  className={
                    selected ? "text-white text-sm" : "text-slate-800 dark:text-slate-100 text-sm"
                  }
                >
                  {type.replace("_", " ")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input
          value={email}
          onChange={setEmail}
          placeholder="Contact email (optional)"
          containerStyle="w-full mb-3"
          widthLabel={false}
        />
        <Input
          value={description}
          onChange={setDescription}
          placeholder="Describe the issue"
          containerStyle="w-full mb-4"
          inputStyle="h-24"
          widthLabel={false}
          multiline
          numberOfLines={4}
        />
        <Button
          w="w-full"
          label={submitting ? "Submitting..." : "Submit report"}
          onPress={onSubmit}
          disabled={submitting}
        />
      </View>
    </Popup>
  );
};

export default ReportUserPopup;
