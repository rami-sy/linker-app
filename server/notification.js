const checkNotificationReceipt = async (receiptId) => {
  try {
    const response = await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: [receiptId] }),
      }
    );

    const responseData = await response.json();
    console.log("📢 حالة الإشعار:", responseData);

    return responseData.data[receiptId]; // يحتوي على status إما "ok" أو "error"
  } catch (error) {
    console.error("❌ خطأ أثناء التحقق من إيصال الإشعار:", error);
  }
};

const sendPushNotification = async (expoPushToken, message, title, data) => {
  const body = {
    to: expoPushToken,
    sound: "default",
    title,
    body: message,
    data: data ? data : { message },
    ttl: 604800, // 7 أيام بالثواني
  };

  try {
    const response = await fetch(
      "https://exp.host/--/api/v2/push/send?useFcmV1=true",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const responseData = await response.json();

    if (responseData.data && responseData.data.id) {
      console.log(`🚀 notification id: ${responseData.data.id}`);
      const status = await checkNotificationReceipt(responseData.data.id);
      console.log({ status });
      return status; // إرجاع الـ receiptId
    }
  } catch (error) {
    console.error("An error occurred while sending the notification: ", error);
  }
};

module.exports = {
  sendPushNotification,
};
