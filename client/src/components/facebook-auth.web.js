import { TouchableOpacity, Image, View, ActivityIndicator } from "react-native";
import React, { useEffect, useState } from "react";
import FacebookLogo from "../../assets/facebook-icon.png";
import { facebookSignin, getMe } from "../api/me";
import { setMe } from "../redux/userSlice";
import { useDispatch } from "react-redux";
import { router } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";
import { loadFacebookSdk, loginWithFacebook } from "../utils/facebookSdk";

const FB_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
const isFbConfigured =
  FB_APP_ID &&
  !["your-facebook-app-id", "YOUR_FACEBOOK_APP_ID"].includes(FB_APP_ID) &&
  FB_APP_ID.length > 5;
const SOCIAL_BUTTON_SIZE = 56;
const SOCIAL_ICON_SIZE = SOCIAL_BUTTON_SIZE;

const FacebookAuth = ({ onError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSdkReady, setIsSdkReady] = useState(false);
  const { isDarkColorScheme } = useColorScheme();
  const dispatch = useDispatch();

  useEffect(() => {
    if (!isFbConfigured) return;

    loadFacebookSdk(FB_APP_ID)
      .then(() => setIsSdkReady(true))
      .catch((error) => onError?.(error?.message || "Facebook sign-in failed"));
  }, [onError]);

  if (!isFbConfigured) return null;

  const handleSuccess = async (accessToken) => {
    setIsLoading(true);
    try {
      const response = await facebookSignin({ token: accessToken });
      if (response?.type === "success") {
        const userResponse = await getMe();
        dispatch(setMe(userResponse.data));
        if (userResponse.data.isCompleted) {
          router.replace("/chats");
        } else {
          router.replace("/user-info");
        }
      } else if (response?.message) {
        onError?.(response.message);
      }
    } catch (error) {
      onError?.(error?.message || "Facebook sign-in failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableOpacity
      disabled={isLoading || !isSdkReady}
      onPress={async () => {
        if (!isSdkReady) {
          onError?.("Facebook login is still loading. Please try again.");
          return;
        }

        try {
          const token = await loginWithFacebook(FB_APP_ID);
          await handleSuccess(token);
        } catch (error) {
          onError?.(error?.message || "Facebook sign-in failed");
        }
      }}
      style={{
        width: SOCIAL_BUTTON_SIZE,
        height: SOCIAL_BUTTON_SIZE,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        marginVertical: 12,
        marginBottom: 24,
        opacity: isLoading ? 0.6 : 1,
      }}
    >
      {isLoading || !isSdkReady ? (
        <View
          style={{
            width: SOCIAL_ICON_SIZE,
            height: SOCIAL_ICON_SIZE,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator
            size="small"
            color={isDarkColorScheme ? "#2D2D37" : "#dee4e6"}
          />
        </View>
      ) : (
        <Image
          source={FacebookLogo}
          style={{ width: SOCIAL_ICON_SIZE, height: SOCIAL_ICON_SIZE }}
          resizeMode="contain"
        />
      )}
    </TouchableOpacity>
  );
};

export default FacebookAuth;
