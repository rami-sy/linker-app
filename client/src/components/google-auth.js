import {
  TouchableOpacity,
  Image,
  Platform,
  View,
  ActivityIndicator,
} from "react-native";
import React, { useEffect, useState } from "react";
import GoogleLogo from "../../assets/google-icon.png";
import { getMe, googleSignin } from "../api/me";
import { setMe } from "../redux/userSlice";
import { useDispatch } from "react-redux";
import { router } from "expo-router";

import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";

import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import { useColorScheme } from "~/lib/useColorScheme";

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

const WebGoogleButton = ({ onToken, onError, isLoading, isDarkColorScheme }) => {
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => onToken(tokenResponse.access_token),
    onError: () => onError?.("Google sign-in failed"),
    scope: "openid email profile",
  });

  return (
    <TouchableOpacity
      disabled={isLoading}
      onPress={() => login()}
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
        <Image source={GoogleLogo} style={{ width: 40, height: 40 }} />
      )}
    </TouchableOpacity>
  );
};

const GoogleAuth = ({ onError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { isDarkColorScheme } = useColorScheme();
  const dispatch = useDispatch();

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      offlineAccess: true,
      forceCodeForRefreshToken: true,
      profileImageSize: 120,
      scopes: ["email", "profile"],
    });
  }, []);

  const sendTokenToServer = async (token) => {
    setIsLoading(true);
    try {
      const response = await googleSignin({ token });
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
      onError?.(error?.message || "Google sign-in failed");
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      await sendTokenToServer(userInfo?.data?.idToken);
    } catch (error) {
      if (
        error.code === statusCodes.SIGN_IN_CANCELLED ||
        error.code === statusCodes.IN_PROGRESS
      ) {
        // User dismissed — no error to show
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        onError?.("Google Play Services not available");
      } else {
        onError?.(error?.message || "Google sign-in failed");
      }
    }
  };

  if (Platform.OS === "web") {
    return (
      <GoogleOAuthProvider clientId={WEB_CLIENT_ID}>
        <WebGoogleButton
          onToken={sendTokenToServer}
          onError={onError}
          isLoading={isLoading}
          isDarkColorScheme={isDarkColorScheme}
        />
      </GoogleOAuthProvider>
    );
  }

  return (
    <TouchableOpacity
      disabled={isLoading}
      onPress={signInWithGoogle}
      style={{
        alignItems: "center",
        justifyContent: "center",
        marginVertical: 12,
        padding: 8,
        borderRadius: 999,
        marginBottom: 24,
        backgroundColor: isDarkColorScheme ? "#dee4e6" : "#2D2D37",
        opacity: isLoading ? 0.6 : 1,
        position: "relative",
      }}
    >
      {isLoading ? (
        <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={isDarkColorScheme ? "#2D2D37" : "#dee4e6"} />
        </View>
      ) : (
        <Image source={GoogleLogo} style={{ width: 40, height: 40 }} />
      )}
    </TouchableOpacity>
  );
};

export default GoogleAuth;
