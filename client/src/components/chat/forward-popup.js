import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  I18nManager,
} from "react-native";

import FeIcon from "@expo/vector-icons/Feather";
import { useTranslation } from "react-i18next";
import Box from "../box.js";
import Privacy from "../privacy.js";
import ImagePlaceholder from "../image-placeholder.js";
import UserImage from "../user-image.js";
import Popup from "../popup.js";
import UserName from "../user-name.js";
import SearchIcon from "../../../assets/icons/search-icon.js";
import useKeyboardVisibility from "../../hooks/use-keyboard-visibility.js";
import { useSelector } from "react-redux";
import { useColorScheme } from "~/lib/useColorScheme";
import { getLocales } from "expo-localization";

const ForwardPopup = ({
  showModal,
  setShowModal,
  list,
  handlePress,
  handleSearch,
  handleLoadMore,
  onRefresh,
  loading,
  search,
  PAGE_SIZE,
  setPage,
  refreshing,
}) => {
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";
  const keyboardVisible = useKeyboardVisibility();
  const { isDarkColorScheme } = useColorScheme();
  return (
    <Popup
      h={keyboardVisible ? "h-[50vh]" : "h-[80vh]"} // Adjust height based on keyboard visibility
      showModal={showModal}
      setShowModal={setShowModal}
      withActions={false}
      justify="justify-start"
      pt="pt-0"
      p="p-0"
      withCloseButton={false}
      title={t("header.forwardMessage") || "Forward Message"}
    >
      <View
        className="flex-row items-center justify-between w-full h-12 px-3 py-1 bg-[#f6f8f9] dark:bg-sec rounded-t-xl"
      >
        <View className={`flex-row items-center justify-start grow gap-x-3`}>
          <TouchableOpacity
            onPress={() => {
              setShowModal(!showModal);
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
          <TextInput
            className="w-full h-10 text-placehoder dark:text-papaya"
            placeholder={t("header.searchPlaceholder")}
            placeholderTextColor={isDarkColorScheme ? "#EDF6F9" : "#023047"}
            autoFocus
            value={search}
            onChangeText={handleSearch}
          />
        </View>
        <TouchableOpacity
          onPress={() => {
            handleSearch(search);
            setPage(1);
          }}
        >
          {isRTL ? (
            <FeIcon
              name="search"
              size={25}
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          ) : (
            <SearchIcon width={24} height={24} />
          )}
        </TouchableOpacity>
      </View>
      <FlatList
        data={list.filter((item) => item.canMsg)}
        className={`w-full p-2`}
        keyExtractor={(item) => item?._id.toString()}
        renderItem={({ item }) => (
          <Box onPress={() => handlePress(item)}>
            <UserImage size="h-12 w-12" border="border-0" user={item} />
            <View
              className={`flex-row items-center justify-between flex-1 w-full`}
            >
              <UserName
                className="mx-2 text-slate-600 dark:text-slate-300"
                user={item}
              />

              {item.isRecent && (
                <FeIcon
                  name="clock"
                  size={20}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              )}
            </View>
          </Box>
        )}
        onEndReachedThreshold={0.1}
        initialNumToRender={PAGE_SIZE}
        onEndReached={handleLoadMore}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListFooterComponent={
          loading && (
            <ActivityIndicator
              size="large"
              color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
            />
          )
        }
      />
    </Popup>
  );
};

export default ForwardPopup;
