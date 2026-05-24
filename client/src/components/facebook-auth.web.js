import { TouchableOpacity, Image, View, ActivityIndicator } from "react-native";
import React, { useState } from "react";
import FacebookLogo from "../../assets/facebook-icon.png";
import { facebookSignin, getMe } from "../api/me";
import { setMe } from "../redux/userSlice";
import { useDispatch } from "react-redux";
import { router } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";
import FacebookLogin from "@greatsumini/react-facebook-login";

const FB_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
const isFbConfigured =
  FB_APP_ID && FB_APP_ID !== "YOUR_FACEBOOK_APP_ID" && FB_APP_ID.length > 5;

const FacebookAuth = ({ onError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { isDarkColorScheme } = useColorScheme();
  const dispatch = useDispatch();

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
    <FacebookLogin
      appId={FB_APP_ID || ""}
      onSuccess={async (response) => {
        await handleSuccess(response.accessToken);
      }}
      onFail={(error) => {
        if (error?.status !== "loginCancelled") {
          onError?.(error?.message || "Facebook sign-in failed");
        }
      }}
      render={({ onClick }) => (
        <TouchableOpacity
          disabled={isLoading}
          onPress={onClick}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDarkColorScheme ? "#dee4e6" : "#2D2D37",
            marginVertical: 12,
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? (
            <ActivityIndicator
              size="small"
              color={isDarkColorScheme ? "#2D2D37" : "#dee4e6"}
            />
          ) : (
            <Image
              source={FacebookLogo}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      )}
    />
  );
};

export default FacebookAuth;
