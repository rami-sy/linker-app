import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import React, { useContext, useEffect, useState, useCallback } from "react";
import { SocketContext } from "../../../contexts/socket.context";

import Layout from "../../../components/layout";
import UserImage from "../../../components/user-image";
import TimeAgo from "../../../components/time-ago";
import FeIcon from "@expo/vector-icons/Feather";
import UserName from "../../../components/user-name";
import { debounce } from "lodash";
import { useSelector } from "react-redux";
import MsgIcon from "../../../../assets/icons/msg-icon";
import { useColorScheme } from "../../../../lib/useColorScheme";

const PAGE_SIZE = 10; // عدد العناصر لكل صفحة

const Main = () => {
  const { socket } = useContext(SocketContext);
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const getPosts = async (page) => {
    setLoading(true);
    if (socket) {
      socket.emit("getPosts", { page, size: PAGE_SIZE });
    }
  };

  const handleGetPosts = (data) => {
    const newPosts = [...(data.posts || [])];
    setPosts((prevPosts) =>
      page === 1 ? newPosts : [...prevPosts, ...newPosts]
    );
    setHasMore(data.posts.length > 0);
    setLoading(false);
  };

  useEffect(() => {
    if (!socket) return;
    getPosts(page);

    socket.on("getPosts", handleGetPosts);

    return () => {
      socket.off("getPosts", handleGetPosts);
    };
  }, [page, socket]);

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    setPage((prev) => prev + 1);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };
  const { isDarkColorScheme } = useColorScheme();
  const renderPost = ({ item: post }) => (
    <View
      key={post._id}
      className="flex w-auto p-3 mb-3 bg-[#f6f8f9] dark:bg-sec rounded-2xl"
    >
      <View className={`flex-row items-center justify-between mb-5`}>
        <View className={`flex-row items-center gap-x-3`}>
          <UserImage size="h-12 w-12" user={post.user} border="border-0" />
          <UserName
            user={post.user}
            className="text-base text-slate-800 dark:text-slate-200"
          />
        </View>
        <View className={`flex-col items-end gap-x-3`}>
          <FeIcon
            name="more-horizontal"
            size={20}
            color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
          />
          <TimeAgo date={post?.createdAt} />
        </View>
      </View>
      <Text className={`mb-1 text-slate-100`}>{post.title}</Text>
      <Text className={`mb-1 text-base text-slate-300`}>{post.content}</Text>

      <View className={`flex-row items-center mt-4 gap-x-4`}>
        <View className={`flex-row items-center gap-x-1`}>
          <FeIcon
            name="heart"
            size={20}
            color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
          />
          <Text className={`text-sm text-slate-400`}>
            {post.reactions.length}
          </Text>
        </View>
        <View className={`flex-row items-center gap-x-1`}>
          {/* <FeIcon
            name="message-circle"
            size={20}
            color={theme === "dark" ? "#EDF6F9" : "#023047"}
          /> */}
          <MsgIcon width={20} height={20} />
          <Text className={`text-sm text-slate-400`}>
            {post.comments.length}
          </Text>
        </View>
        <FeIcon
          name="share"
          size={20}
          color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
        />
      </View>
    </View>
  );

  return (
    <Layout>
      <View className={`flex-row items-center justify-between`}>
        <Text className={`text-2xl font-bold text-slate-100`}>Posts</Text>
        <FeIcon
          name="plus"
          size={20}
          color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
        />
      </View>
      <FlatList
        data={posts}
        keyExtractor={(item) => item._id.toString()}
        renderItem={renderPost}
        onEndReachedThreshold={0.1}
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
        contentContainerStyle={{ marginBottom: 8 }}
      />
    </Layout>
  );
};

export default Main;
