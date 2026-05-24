import { TouchableOpacity, Image, View, ActivityIndicator, Platform } from "react-native";
import React, { useState } from "react";
import FacebookLogo from "../../assets/facebook-icon.png";
import { facebookSignin, getMe } from "../api/me";
import { setMe } from "../redux/userSlice";
import { useDispatch } from "react-redux";
import { router } from "expo-router";
import { useColorScheme } from "~/lib/useColorScheme";

const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;

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

  const buttonStyle = {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
    padding: 8,
    borderRadius: 999,
    marginBottom: 24,
    backgroundColor: isDarkColorScheme ? "#dee4e6" : "#2D2D37",
    opacity: isLoading ? 0.6 : 1,
  };

  const logoSource = typeof FacebookLogo === "string" ? { uri: FacebookLogo } : FacebookLogo;

  if (Platform.OS === "web") {
    const FacebookLogin = require("@greatsumini/react-facebook-login").default;

    return (
      <FacebookLogin
        appId={FACEBOOK_APP_ID}
        onSuccess={(res) => handleSuccess(res.accessToken)}
        onFail={(err) => onError?.(err?.message || "Facebook sign-in failed")}
        render={({ onClick }) => (
          <TouchableOpacity
            disabled={isLoading}
            onPress={onClick}
            style={buttonStyle}
          >
            {isLoading ? (
              <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="small" color={isDarkColorScheme ? "#2D2D37" : "#dee4e6"} />
              </View>
            ) : (
              <Image source={logoSource} style={{ width: 40, height: 40 }} />
            )}
          </TouchableOpacity>
        )}
      />
    );
  }

  // Android / iOS — requires react-native-fbsdk-next + Facebook App configured
  const signInWithFacebook = async () => {
    try {
      const { LoginManager, AccessToken } = require("react-native-fbsdk-next");
      const result = await LoginManager.logInWithPermissions(["public_profile", "email"]);
      if (result.isCancelled) return;
      const data = await AccessToken.getCurrentAccessToken();
      if (data?.accessToken) {
        await handleSuccess(data.accessToken.toString());
      } else {
        onError?.("Could not get Facebook access token");
      }
    } catch (error) {
      onError?.(error?.message || "Facebook sign-in failed");
    }
  };

  return (
    <TouchableOpacity
      disabled={isLoading}
      onPress={signInWithFacebook}
      style={buttonStyle}
    >
      {isLoading ? (
        <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={isDarkColorScheme ? "#2D2D37" : "#dee4e6"} />
        </View>
      ) : (
        <Image source={logoSource} style={{ width: 40, height: 40 }} />
      )}
    </TouchableOpacity>
  );
};

export default FacebookAuth;
