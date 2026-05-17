import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  I18nManager,
} from "react-native";
import React, { useState, useRef } from "react";
import SearchIcon from "../../assets/icons/search-icon.js";
import { useDispatch } from "react-redux";
import Icon from "react-native-vector-icons/Ionicons";
import { setFriends } from "../redux/userSlice.js";
import { getLocales } from "expo-localization";
import { useColorScheme } from "~/lib/useColorScheme";

const SearchBar = ({
  handleSearch,
  label,
  search,
  setSearch,
  searching,
  setSearching,
}) => {
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";
  const searchRef = useRef(null);
  const [showSearch, setShowSearch] = useState(false);
  const { isDarkColorScheme } = useColorScheme();
  const dispatch = useDispatch();
  const onPress = async (text) => {
    dispatch(setFriends([]));
    setSearching(true);
    setSearch(text);
    await handleSearch(text);
  };
  return (
    <>
      <View className={`items-center justify-between grow`}>
        <TextInput
          className={`w-full h-10 text-lg bg-transparent outline-none appearance-none ${
            isRTL ? "text-right" : "text-left"
          } text-slate-900 dark:text-slate-100`}
          placeholder={label}
          placeholderTextColor={isDarkColorScheme ? "#EDF6F9" : "#023047"}
          value={search}
          onChangeText={onPress}
          ref={searchRef}
        />
      </View>

      <TouchableOpacity
        className={`flex-row items-center justify-center w-10 h-10 rounded-full bg-[#EDF6F9] dark:bg-[#ef233c] mx-2`}
        onPress={() => {
          searchRef.current.focus();
        }}
      >
        {searching ? (
          <ActivityIndicator
            size={25}
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        ) : (
          <SearchIcon width={24} height={24} />
        )}
      </TouchableOpacity>

      {/* <TouchableOpacity
        className={`flex-row items-center justify-center w-10 h-10 p-2 rounded-full bg-[#f56800]`}
      >
        <Icon name="call" size={24} color="#dee4e6" />
      </TouchableOpacity> */}
    </>
  );
};

export default SearchBar;
