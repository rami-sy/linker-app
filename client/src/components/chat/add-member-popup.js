import React from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  I18nManager,
} from "react-native";

import { useTranslation } from "react-i18next";
import UserImage from "../user-image.js";
import Popup from "../popup.js";
import UserName from "../user-name.js";
import { useColorScheme } from "~/lib/useColorScheme";
import SearchIcon from "../../../assets/icons/search-icon.js";
import useSelectedRoom from "../../hooks/use-selected-room.js";

const AddMemberPopup = ({
  showModal,
  setShowModal,
  list,
  handleAddMember,
  handleSearch,
  handleLoadMore,
  loading,
  search,
  PAGE_SIZE,
  onRefresh,
  returnToGroupDetails,
  setReturnToGroupDetails,
  setGroupDetailsModal,
}) => {
  const { t } = useTranslation();
  const { isDarkColorScheme } = useColorScheme();
  const room = useSelectedRoom(); // Use the custom hook to get the selected room

  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";
  return (
    <Popup
      showModal={showModal}
      setShowModal={() => {
        setShowModal(!showModal);
        if (returnToGroupDetails) {
          setGroupDetailsModal(true);
          setReturnToGroupDetails(false);
        }
      }}
      withActions={false}
      justify="justify-start"
      items="items-start"
      pt="pt-0"
      p="p-0"
      withCloseButton={true}
      title={t("header.addMember") || "Add Member"}
      w="w-[95%] md:w-[85%] lg:w-[500px]"
      opacity="75"
    >
      {/* Search Bar */}
      <View className="w-full px-4 pt-4 pb-3">
        <View className="flex-row items-center gap-x-3 bg-white dark:bg-slate-800/50 rounded-xl px-4 py-3">
          <SearchIcon width={20} height={20} />
          <TextInput
            className={`flex-1 h-10 ${isRTL ? "text-right" : "text-left"} text-placehoder dark:text-papaya`}
            placeholder={t("header.searchPlaceholder")}
            placeholderTextColor={isDarkColorScheme ? "#94a3b8" : "#64748b"}
            autoFocus
            value={search}
            onChangeText={handleSearch}
          />
        </View>
      </View>

      {/* Members List */}
      <FlatList
        data={
          list.filter(
            (item) =>
              item.canMsg &&
              room?.members?.findIndex(
                (member) => member?._id === item?._id
              ) === -1
          ) || []
        }
        className="w-full"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        keyExtractor={(item, index) => item?._id.toString() + index.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => {
              handleAddMember(item);
              if (returnToGroupDetails) {
                setGroupDetailsModal(true);
                setReturnToGroupDetails(false);
              }
            }}
            className="flex-row items-center w-full px-2 h-14 bg-white dark:bg-slate-800/50 rounded-xl mb-3"
            activeOpacity={0.7}
          >
            <UserImage size="h-12 w-12" border="border-0" user={item} />
            <View className="flex-row items-center justify-between flex-1 ml-3">
              <UserName
                className="text-slate-700 dark:text-slate-300"
                user={item}
                onlyFirst={true}
              />
            </View>
          </TouchableOpacity>
        )}
        onEndReachedThreshold={0.1}
        initialNumToRender={PAGE_SIZE}
        onEndReached={handleLoadMore}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} />
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

export default AddMemberPopup;
