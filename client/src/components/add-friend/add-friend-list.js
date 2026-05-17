import {
  View,
  TouchableOpacity,
  Text,
  FlatList,
  RefreshControl,
  I18nManager,
  ActivityIndicator,
} from "react-native";
import React, { useCallback, useContext, useRef, useState } from "react";
import FeIcon from "react-native-vector-icons/Feather";

import { UserDisplay } from "../user";
import { useDispatch, useSelector } from "react-redux";
import { useColorScheme } from "~/lib/useColorScheme";
import ImagePlaceholder from "../image-placeholder";
import { useFriendAction } from "../../sockets/friend";
import { useTranslation } from "react-i18next";
import { PAGE_SIZE } from "../../constants";
import MsgIcon from "../../../assets/icons/msg-icon";
import { router, useFocusEffect } from "expo-router";
import { setPage, setScrollOffset } from "../../redux/exploreSlice";
import { SocketContext } from "../../contexts/socket.context";
import { setUserProfile } from "../../redux/userSlice";
import MCIcon from "react-native-vector-icons/MaterialCommunityIcons";
import UserIcon from "../../../assets/icons/user-icon";
import UserInteractiveIcon from "../user/user-interactive-icon";

const ITEM_HEIGHT = 68; // قم بتحديد ارتفاع العنصر بشكل ثابت
const MAX_REASON_BADGES = 2;

const AddFriendList = ({
  handleCreateRoom,
  onRefresh,
  handleLoadMore,
  onSearchUsers,
  formData,
  setShowUserCard,
  handleReaction,
  listRef
}) => {
  const { user, senderReactions } = useSelector((state) => state.users);

  const { isDarkColorScheme } = useColorScheme();
  const { socket } = useContext(SocketContext);
  const {
    exploreUsers,
    page,
    scrollOffset,
    hasMore,
    sortBy,
    loading,
    refreshing,
  } = useSelector((state) => state.explore);
  const { handleSendFriendRequest, handleCancelFriendRequest } =
    useFriendAction();
  const dispatch = useDispatch();
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";
  const { t } = useTranslation(); // استخدام الترجمة

  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const formatDistanceKm = useCallback((km) => {
    const value = Number(km || 0);
    if (!Number.isFinite(value) || value <= 0) return "1";
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${Math.round(value)}`;
  }, []);
  const getReasonMeta = useCallback(
    (reason) => {
      if (!reason?.key) return null;
      if (reason.key === "sharedInterests") {
        return {
          label: t("explore.reasons.sharedInterests", { count: reason.count || 1 }),
          icon: "star",
          badgeClassName:
            "bg-slate-100/95 border-slate-300 dark:bg-slate-800/85 dark:border-slate-600",
          textClassName: "text-slate-700 dark:text-slate-200",
        };
      }
      if (reason.key === "mutualFriends") {
        return {
          label: t("explore.reasons.mutualFriends", { count: reason.count || 1 }),
          icon: "users",
          badgeClassName:
            "bg-slate-100/95 border-slate-300 dark:bg-slate-800/85 dark:border-slate-600",
          textClassName: "text-slate-700 dark:text-slate-200",
        };
      }
      if (reason.key === "nearby") {
        return {
          label: t("explore.reasons.nearby", {
            km: formatDistanceKm(reason.km || 1),
          }),
          icon: "map-pin",
          badgeClassName:
            "bg-slate-100/95 border-slate-300 dark:bg-slate-800/85 dark:border-slate-600",
          textClassName: "text-slate-700 dark:text-slate-200",
        };
      }
      if (reason.key === "recentlyActive") {
        return {
          label: t("explore.reasons.recentlyActive"),
          icon: "clock",
          badgeClassName:
            "bg-slate-100/95 border-slate-300 dark:bg-slate-800/85 dark:border-slate-600",
          textClassName: "text-slate-700 dark:text-slate-200",
        };
      }
      return null;
    },
    [t, formatDistanceKm]
  );

  const loadMoreData = async () => {
    if (!hasMore || loading) return;
    setIsFetchingMore(true);
    // مثلًا:
    dispatch(setPage(page + 1));

    onSearchUsers({ ...formData }, page, sortBy);

    // بعد الانتهاء من التحميل
    setIsFetchingMore(false);
  };

  // useFocusEffect(
  //   useCallback(() => {
  //     if (listRef.current) {
  //       listRef.current.scrollToOffset({
  //         offset: scrollOffset,
  //         animated: false,
  //       });
  //     }
  //   }, [scrollOffset])
  // );
  const handleScroll = (event) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;

    dispatch(setScrollOffset(contentOffset.y));
    // احسب المسافة التي تم تمريرها مع ارتفاع الشاشة
    const distanceFromBottom =
      contentSize.height - (layoutMeasurement.height + contentOffset.y);

    // هنا مثلاً threshold = 20 يعني متى وصل المستخدم لمسافة 20 بيكسل من آخر القائمة تقريباً
    if (distanceFromBottom < 20 && !isFetchingMore) {
      // استدعِ دالة التحميل
      loadMoreData();
    }
  };
  return exploreUsers.length === 0 && !loading ? (
    <View className={`flex items-center justify-center`}>
      <Text
        className="text-base text-center text-slate-600 dark:text-slate-300"
      >
        {t("general.noUsersFound")}{" "}
      </Text>
      <TouchableOpacity
        onPress={() => {
          onSearchUsers(
            {
              preferredGenders: user?.preferredGenders
                ? user?.preferredGenders
                : [],
              locationType: "worldwide",
              search: "",
            },
            1,
            "",
            "active"
          );
        }}
      >
        <Text
          className="text-base text-center underline text-placehoder dark:text-papaya"
        >
          {t("general.clickToGetRecommendedUsers")}
        </Text>
      </TouchableOpacity>
    </View>
  ) : (
    <FlatList
      data={exploreUsers}
      onScroll={handleScroll}
      ref={listRef}
      keyExtractor={(item) => item?._id}
      renderItem={({ item, index }) => (
        <TouchableOpacity
          className="flex-row items-center w-full h-16 px-2 mb-1 rounded-2xl border-0 bg-[#f6f8f9] dark:bg-sec"
          style={{ borderWidth: 0 }}
          onPress={() => {
            handleCreateRoom(item);
          }}
          disabled={!item?.canMsg}
        >
          <UserDisplay
            user={item}
            variant="list"
            imageSize="h-12 w-12"
            imageBorder="border-0"
            onPress={() => handleCreateRoom(item)}
            onAvatarPress={async () => {
              const res = await socket.emitWithAck("getOneUser", {
                targetUserId: item?._id,
              });
              dispatch(setUserProfile(res.data));
              setShowUserCard(true);
            }}
            onlyFirst={false}
            className="flex-1"
            actions={
              <View className="items-end px-1">
                {Array.isArray(item?.recommendationReasons) &&
                  item.recommendationReasons.length > 0 && (
                    <View className="mb-1 flex-row items-center gap-x-1">
                      {item.recommendationReasons
                        .slice(0, MAX_REASON_BADGES)
                        .map((reason, reasonIndex) => {
                          const meta = getReasonMeta(reason);
                          if (!meta?.label) return null;
                          return (
                            <View
                              key={`${item?._id}-reason-${reason?.key}-${reasonIndex}`}
                              className={`rounded-full border px-2 py-[3px] flex-row items-center gap-x-1 ${meta.badgeClassName}`}
                            >
                              <FeIcon
                                name={meta.icon}
                                size={10}
                                color={isDarkColorScheme ? "#e2e8f0" : "#0f172a"}
                              />
                              <Text
                                className={`text-[11px] font-medium ${meta.textClassName}`}
                              >
                                {meta.label}
                              </Text>
                            </View>
                          );
                        })}
                    </View>
                  )}
                <View className={`flex-row items-center gap-x-3 px-2`}>
                  <TouchableOpacity
                    className={`flex-row items-center justify-center`}
                    onPress={() => handleReaction(item, "like")}
                  >
                    <MCIcon
                      name={
                        senderReactions?.find(
                          (reaction) =>
                            reaction?.target === item?._id &&
                            reaction?.targetModel === "User"
                        )?.reaction === "like"
                          ? "cards-heart"
                          : "cards-heart-outline"
                      }
                      size={30}
                      style={{
                        color:
                          senderReactions?.find(
                            (reaction) =>
                              reaction?.target === item?._id &&
                              reaction?.targetModel === "User"
                          )?.reaction === "like"
                            ? "#ef233c"
                            : isDarkColorScheme
                            ? "#dee4e6"
                            : "#012a4a",
                      }}
                    />
                  </TouchableOpacity>
                  {item?.canMsg && (
                    <TouchableOpacity
                      className={`flex-row items-center justify-center text-stone-600`}
                      style={{ transform: [{ translateY: -2 }] }}
                      onPress={() => handleCreateRoom(item)}
                      disabled={!item?.canMsg}
                    >
                      <MsgIcon width={25} height={25} />
                    </TouchableOpacity>
                  )}
                  {user?.friends?.includes?.(item?._id) ? (
                    <TouchableOpacity className={`flex-row items-center justify-center`}>
                      <UserInteractiveIcon
                        iconSize={23}
                        containerClassName={`${isRTL ? "ml-2" : "mr-2"}`}
                        iconSecondarySize={null}
                      />
                    </TouchableOpacity>
                  ) : user?.outgoingFriendRequests?.includes?.(item?._id) ? (
                    <TouchableOpacity
                      className={`flex-row items-center justify-center`}
                      onPress={() =>
                        handleCancelFriendRequest({
                          targetUserId: item?._id,
                          userId: user?._id,
                        })
                      }
                    >
                      <UserInteractiveIcon
                        iconName="minus"
                        iconSize={23}
                        iconSecondarySize={18}
                        containerClassName={`${isRTL ? "ml-2" : "mr-2"}`}
                      />
                    </TouchableOpacity>
                  ) : item?.canAdd ? (
                    <TouchableOpacity
                      className={`flex-row items-center justify-center`}
                      onPress={() =>
                        handleSendFriendRequest({
                          targetUserId: item?._id,
                        })
                      }
                      disabled={!item?.canAdd}
                    >
                      <UserInteractiveIcon
                        iconName="plus"
                        iconSize={23}
                        iconSecondarySize={18}
                        containerClassName={`${isRTL ? "ml-2" : "mr-2"}`}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            }
          />
        </TouchableOpacity>
      )}
      onEndReachedThreshold={0.5}
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
      getItemLayout={(data, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      })}
    />
  );
};

export default AddFriendList;
