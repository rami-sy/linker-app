import { TouchableOpacity, Image, Platform, Text, View } from "react-native";
import React, { useEffect } from "react";
import GoogleLogo from "../../assets/google-icon.png";
import { getMe, googleSignin } from "../api/me";
import { setMe } from "../redux/userSlice";
import { useDispatch, useSelector } from "react-redux";
import { router } from "expo-router";

// Android
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";

import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useColorScheme } from "~/lib/useColorScheme";

const GoogleAuth = () => {
  useEffect(() => {
    GoogleSignin.configure({
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      webClientId:
        "291973193159-2blim9hhevst8r5p074lujhb47qvo391.apps.googleusercontent.com",
      offlineAccess: true,
      forceCodeForRefreshToken: true,
      profileImageSize: 120,
      scopes: ["email", "profile"],
    });
  }, []);

  const { isDarkColorScheme } = useColorScheme();

  const dispatch = useDispatch();

  const sendTokenToServer = async (token) => {
    try {
      const response = await googleSignin({
        token: token,
      });
      if (response?.type === "success") {
        const userResponse = await getMe();
        dispatch(setMe(userResponse.data));
        if (userResponse.data.isCompleted) {
          // ✅ Use replace to clear auth stack after successful login
          router.replace("/chats");
        } else {
          // ✅ Use replace to clear auth stack
          router.replace("/user-info");
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  const signInWithGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      await sendTokenToServer(userInfo?.data?.idToken);
    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log("User cancelled the login process");
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log("Sign in in progress");
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        console.log("Play services not available");
      } else {
        console.error("Google Sign-In error", error);
      }
    }
  };
  return Platform.OS === "web" ? (
    <View className="flex-row items-center justify-center my-3">
      <GoogleOAuthProvider clientId="291973193159-2blim9hhevst8r5p074lujhb47qvo391.apps.googleusercontent.com">
        <GoogleLogin
          onSuccess={(credentialResponse) => {
            sendTokenToServer(credentialResponse.credential);
          }}
          onError={() => {
            console.log("Login Failed");
          }}
          shape="circle"
          type="icon"
          size="larg"
        />
      </GoogleOAuthProvider>
    </View>
  ) : (
    <TouchableOpacity
      className={`items-center justify-center my-3 p-2 rounded-full mb-6 ${
        isDarkColorScheme ? "bg-[#dee4e6]" : "bg-[#2D2D37]"
      }`}
      onPress={() => {
        signInWithGoogle();
      }}
    >
      <Image source={GoogleLogo} className="w-10 h-10" />
    </TouchableOpacity>
  );
};

export default GoogleAuth;
