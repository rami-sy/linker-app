import { TouchableOpacity, Image, View, ActivityIndicator } from "react-native";
import React, { useState } from "react";
import FacebookLogo from "../../assets/facebook-icon.png";
import { facebookSignin, getMe } from "../api/me";
import { setMe } from "../redux/userSlice";
import { useDispatch } from "react-redux";
import { router } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";
// Facebook native SDK not configured yet — login disabled on Android

const FacebookAuth = ({ onError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { isDarkColorScheme } = useColorScheme();
  const dispatch = useDispatch();

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

  const signInWithFacebook = async () => {
    onError?.("Facebook login is not available on this platform yet.");
  };

  return (
    <TouchableOpacity
      disabled={isLoading}
      onPress={signInWithFacebook}
      style={{
        alignItems: "center",
        justifyContent: "center",
        marginVertical: 12,
        padding: 8,
        borderRadius: 999,
        marginBottom: 24,
        backgroundColor: isDarkColorScheme ? "#dee4e6" : "#2D2D37",
        opacity: isLoading ? 0.6 : 1,
      }}
    >
      {isLoading ? (
        <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={isDarkColorScheme ? "#2D2D37" : "#dee4e6"} />
        </View>
      ) : (
        <Image source={FacebookLogo} style={{ width: 40, height: 40 }} />
      )}
    </TouchableOpacity>
  );
};

export default FacebookAuth;
