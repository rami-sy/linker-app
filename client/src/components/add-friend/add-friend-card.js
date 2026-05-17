import {
  View,
  TouchableOpacity,
  FlatList,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import React from "react";

import UserImage from "../user-image";
import { UserDisplay } from "../user";

import { useSelector } from "react-redux";
import { useFriendAction } from "../../sockets/friend";
import { PAGE_SIZE } from "../../constants";
import MsgIcon from "../../../assets/icons/msg-icon";
import { router } from "expo-router";
import { useColorScheme } from "../../../lib/useColorScheme";
import UserInteractiveIcon from "../user/user-interactive-icon";
const windowWidth = Dimensions.get("window").width;

const AddFriendCard = ({
  users,
  handleCreateRoom,
  loading,
  refreshing,
  onRefresh,
  handleLoadMore,
}) => {
  const { user } = useSelector((state) => state.users);
  const { isDarkColorScheme } = useColorScheme();
  const { handleSendFriendRequest, handleCancelFriendRequest } =
    useFriendAction();
  return (
    <FlatList
      data={users}
      keyExtractor={(item) => item?._id}
      numColumns={1} // This will create a 2-column grid
      renderItem={({ item, index }) => (
        <View className={`w-full mb-4`}>
          <TouchableOpacity
            className={`flex items-center justify-start h-full overflow-hidden rounded-2xl`}
          >
            <UserImage
              style={{
                width: windowWidth - 20,
                height: "50vh",
              }}
              resizeMode="cover" // or 'cover' depending on your needs
              border="border-0"
              rounded="rounded-2xl"
              showStatus={false}
              user={item}
              onPress={() => {
                router.push({
                  pathname: `/profile/${item?._id}`,
                  params: { from: "explore" },
                });
              }}
            />
            <View className={` absolute w-full bottom-[4px] p-[2px]`}>
              <View
                className={`relative flex-col items-start justify-between mb-2 -ml-[2px]`}
                style={{
                  width: "fit-content",
                }}
              >
                <UserDisplay
                  user={item}
                  showAvatar={false}
                  showStatusDot={false}
                  variant="compact"
                  className="bg-[#0a97b9]"
                  primaryClassName="text-slate-100"
                  onPress={() => {
                    router.push({
                      pathname: `/profile/${item?._id}`,
                      params: { from: "explore" },
                    });
                  }}
                />
                <View
                  className={`absolute bottom-0 -right-1 h-3 w-3 ${
                    item?.status === "online" ? "bg-[#0a97b9]" : "bg-slate-400"
                  } border-2 border-papaya rounded-full`}
                />
              </View>
              {/* <Text
                 className={`px-2 mb-1 text-base text-slate-100 bg-[#00000099] py-1 rounded-2xl`}
                >
                  {_.words(item?.bio).length > 15
                    ? _.join(_.take(_.words(item?.bio), 15), " ") + "..."
                    : item?.bio}
                </Text> */}
              <View
                className={`flex-row items-center justify-center w-full gap-x-3`}
              >
                {item?.canMsg && (
                  <TouchableOpacity
                    className={`flex-row items-center justify-center bg-[#00000099] rounded-2xl p-2`}
                    onPress={() => handleCreateRoom(item)}
                    disabled={!item?.canMsg}
                  >
                    <MsgIcon width={25} height={25} />
                  </TouchableOpacity>
                )}
                {user?.friends?.includes?.(item?._id) ? (
                  <TouchableOpacity
                    className={`flex-row items-center justify-center bg-[#00000099] rounded-2xl p-2`}
                    // onPress={() => handleSendFriendRequest(item)}
                  >
                    <UserInteractiveIcon
                      iconSize={26}
                      iconSecondarySize={null}
                      color="#dee4e6"
                    />
                  </TouchableOpacity>
                ) : user?.outgoingFriendRequests?.includes?.(item?._id) ? (
                  <TouchableOpacity
                    className={`flex-row items-center justify-center bg-[#00000099] rounded-2xl p-2`}
                    onPress={() =>
                      handleCancelFriendRequest({
                        targetUserId: item?._id,
                      })
                    }
                  >
                    <UserInteractiveIcon
                      iconName="minus"
                      iconSize={26}
                      iconSecondarySize={18}
                      color="#dee4e6"
                    />
                  </TouchableOpacity>
                ) : item?.canAdd ? (
                  <TouchableOpacity
                    className={`flex-row items-center justify-center bg-[#00000099] rounded-2xl p-2`}
                    onPress={() =>
                      handleSendFriendRequest({
                        targetUserId: item?._id,
                      })
                    }
                    disabled={!item?.canAdd}
                  >
                    <UserInteractiveIcon
                      iconName="plus"
                      iconSize={26}
                      iconSecondarySize={18}
                      color="#dee4e6"
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        </View>
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
  );
};

export default AddFriendCard;
