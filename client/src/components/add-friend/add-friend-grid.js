import {
  View,
  TouchableOpacity,
  FlatList,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import React from "react";
import FeIcon from "@expo/vector-icons/Feather";

import UserImage from "../user-image";
import { UserDisplay } from "../user";

import { useDispatch, useSelector } from "react-redux";
import { useFriendAction } from "../../sockets/friend";
import { PAGE_SIZE } from "../../constants";
import { useTranslation } from "react-i18next";
import MsgIcon from "../../../assets/icons/msg-icon";
import { router } from "expo-router";
import { useColorScheme } from "../../../lib/useColorScheme";
const windowWidth = Dimensions.get("window").width;

const AddFriendGrid = ({
  users,
  handleCreateRoom,
  loading,
  refreshing,
  onRefresh,
  handleLoadMore,
}) => {
  const { user } = useSelector((state) => state.users);

  const { handleSendFriendRequest, handleCancelFriendRequest } =
    useFriendAction();
  const { isDarkColorScheme } = useColorScheme();
  const dispatch = useDispatch();
  const { t } = useTranslation(); // استخدام الترجمة

  return (
    <FlatList
      data={users || []}
      keyExtractor={(item) => item?._id}
      numColumns={2} // This will create a 2-column grid
      renderItem={({ item, index }) => (
        <TouchableOpacity
          className={`w-1/2 p-1`}
          onPress={() => handleCreateRoom(item)}
          disabled={!item?.canMsg}
        >
          <UserImage
            style={{
              width: windowWidth / 2 - 20,
              height: 184,
            }}
            size="w-full h-48"
            resizeMode="cover" // or 'cover' depending on your needs
            border="border-0"
            rounded="rounded-2xl"
            p="p-0"
            user={item}
            overflow="overflow-hidden"
            showStatus={false}
            onPress={() => {
              router.push({
                pathname: `/profile/${item?._id}`,
                params: { from: "explore" },
              });
            }}
            bgColor="#1e212b"
          >
            <View
              className={`flex-col items-center justify-between h-14 flex-1 w-full absolute bottom-0 p-[2px] bg-[#00000099]`}
            >
              <UserDisplay
                user={item}
                showAvatar={false}
                showStatusDot={false}
                onPress={() => {
                  router.push({
                    pathname: `/profile/${item?._id}`,
                    params: { from: "explore" },
                  });
                }}
                primaryClassName="text-slate-100"
                className="w-full"
                actions={
                  <View className={`flex-row items-center justify-center w-full gap-x-4`}>
                    {item?.canMsg && (
                      <TouchableOpacity
                        className={`flex-row items-center justify-center`}
                        onPress={() => handleCreateRoom(item)}
                        disabled={!item?.canMsg}
                      >
                        <MsgIcon width={25} height={25} />
                      </TouchableOpacity>
                    )}
                    {user?.friends?.includes?.(item?._id) ? (
                      <TouchableOpacity className={`flex-row items-center justify-center`}>
                        <FeIcon name="user" size={23} color="#dee4e6" />
                      </TouchableOpacity>
                    ) : user?.outgoingFriendRequests?.includes?.(item?._id) ? (
                      <TouchableOpacity
                        className={`flex-row items-center justify-center`}
                        onPress={() =>
                          handleCancelFriendRequest({
                            targetUserId: item?._id,
                          })
                        }
                      >
                        <FeIcon name="user-minus" size={23} color="#dee4e6" />
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
                        <FeIcon name="user-plus" size={23} color="#dee4e6" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                }
              />
            </View>
          </UserImage>
        </TouchableOpacity>
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
export default AddFriendGrid;
