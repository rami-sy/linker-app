import { createSlice } from "@reduxjs/toolkit";

export const userSlice = createSlice({
  name: "users",
  initialState: {
    user: null,
    socketId: null,
    userProfile: null,
    userProfileId: null,
    users: [],
    incomingFriendRequests: [],
    outgoingFriendRequests: [],
    friends: [],
    blockedUsers: [],
    fans: [],
    following: [],
    visitors: [],
    senderReactions: [],
  },
  reducers: {
    setMe: (state, action) => {
      state.user = action.payload;
      if (
        state.userProfile?._id &&
        action.payload?._id &&
        String(state.userProfile._id) === String(action.payload._id)
      ) {
        state.userProfile = {
          ...state.userProfile,
          images: action.payload.images ?? state.userProfile.images,
          colors: action.payload.colors ?? state.userProfile.colors,
        };
      }
    },
    setSocketId: (state, action) => {
      state.socketId = action.payload;
    },
    updateMe: (state, action) => {
      state.user = {
        ...state.user,
        ...action.payload,
      };
    },
    setUsers: (state, action) => {
      state.users = action.payload;
    },
    setUserProfile: (state, action) => {
      state.userProfile = action.payload;
    },
    setUserProfileId: (state, action) => {
      state.userProfileId = action.payload;
    },
    removeMe: (state) => {
      state.user = null;
      state.userProfile = null;
      state.userProfileId = null;
      state.users = [];
      state.incomingFriendRequests = [];
      state.outgoingFriendRequests = [];
      state.friends = [];
      state.fans = [];
      state.following = [];
      state.visitors = [];
      state.blockedUsers = [];
    },

    setFriends: (state, action) => {
      state.friends = action.payload;
    },

    acceptFriendRequest: (state, action) => {
      state.friends = [...state.friends, action.payload];
      state.incomingFriendRequests = state.incomingFriendRequests.filter(
        (request) => request._id !== action.payload._id
      );
      state.outgoingFriendRequests = state.outgoingFriendRequests.filter(
        (request) => request._id !== action.payload._id
      );

      state.user = {
        ...state.user,
        friends: [...state.user.friends, action.payload._id],
        incomingFriendRequests: state.user.incomingFriendRequests.filter(
          (request) => request !== action.payload._id
        ),
        outgoingFriendRequests: state.user.outgoingFriendRequests.filter(
          (request) => request !== action.payload._id
        ),
      };
    },

    removeFriend: (state, action) => {
      state.friends = state.friends.filter(
        (friend) => friend._id !== action.payload._id
      );
      state.user = {
        ...state.user,
        friends: state.user.friends.filter(
          (friend) => friend !== action.payload._id
        ),
      };
    },

    setIncomingFriendRequests: (state, action) => {
      state.incomingFriendRequests = action.payload;
    },
    setOutgoingFriendRequests: (state, action) => {
      state.outgoingFriendRequests = action.payload;
    },
    setBlockedUsers: (state, action) => {
      state.blockedUsers = action.payload;
    },
    setFans: (state, action) => {
      state.fans = action.payload;
    },
    setFollowing: (state, action) => {
      state.following = action.payload;
    },
    setVisitors: (state, action) => {
      state.visitors = action.payload;
    },

    addIncomingFriendRequest: (state, action) => {
      state.incomingFriendRequests.push(action.payload);
    },

    removeIncomingFriendRequest: (state, action) => {
      state.incomingFriendRequests = state.incomingFriendRequests.filter(
        (request) => request._id !== action.payload._id
      );
    },

    addOutgoingFriendRequest: (state, action) => {
      state.outgoingFriendRequests.push(action.payload);
    },
    removeOutgoingFriendRequest: (state, action) => {
      state.outgoingFriendRequests = state.outgoingFriendRequests.filter(
        (request) => request._id !== action.payload._id
      );
    },

    addBlockedUser: (state, action) => {
      state.blockedUsers.push(action.payload);
    },
    removeBlockedUser: (state, action) => {
      state.blockedUsers = state.blockedUsers.filter(
        (user) => user?._id !== action.payload._id
      );
    },
    changeUserStatus: (state, action) => {
      state.friends = state.friends.map((friend) =>
        friend._id === action.payload.userId
          ? { ...friend, status: action.payload.status }
          : friend
      );
      state.incomingFriendRequests = state.incomingFriendRequests.map(
        (request) =>
          request._id === action.payload.userId
            ? { ...request, status: action.payload.status }
            : request
      );
      state.outgoingFriendRequests = state.outgoingFriendRequests.map(
        (request) =>
          request._id === action.payload.userId
            ? { ...request, status: action.payload.status }
            : request
      );
      state.users = state.users.map((user) =>
        user._id === action.payload.userId
          ? { ...user, status: action.payload.status }
          : user
      );
      state.userProfile = state.userProfile
        ? {
            ...state.userProfile,
            status: action.payload.status
              ? action.payload.status
              : state.userProfile.status,
          }
        : state.userProfile;
    },
    changeUserLastSeen: (state, action) => {
      state.users = state.users.map((user) =>
        user._id === action.payload.userId
          ? { ...user, lastSeen: action.payload.lastSeen }
          : user
      );
      state.friends = state.friends.map((friend) =>
        friend._id === action.payload.userId
          ? { ...friend, lastSeen: action.payload.lastSeen }
          : friend
      );
      state.incomingFriendRequests = state.incomingFriendRequests.map(
        (request) =>
          request._id === action.payload.userId
            ? { ...request, lastSeen: action.payload.lastSeen }
            : request
      );
      state.outgoingFriendRequests = state.outgoingFriendRequests.map(
        (request) =>
          request._id === action.payload.userId
            ? { ...request, lastSeen: action.payload.lastSeen }
            : request
      );
      state.userProfile = state.userProfile
        ? {
            ...state.userProfile,
            lastSeen: action.payload.lastSeen
              ? action.payload.lastSeen
              : state.userProfile.lastSeen,
          }
        : state.userProfile;
    },
    setSenderReactions: (state, action) => {
      state.senderReactions = action.payload;
    },

    addSenderReaction: (state, action) => {
      state.senderReactions.push(action.payload);
    },
    removeSenderReaction: (state, action) => {
      state.senderReactions = state.senderReactions.filter(
        (reaction) => reaction._id !== action.payload._id
      );
    },
  },
});

export const {
  setMe,
  setUserProfile,
  setUserProfileId,
  removeMe,
  setUsers,
  setFriends,
  setIncomingFriendRequests,
  addIncomingFriendRequest,
  setOutgoingFriendRequests,
  addOutgoingFriendRequest,
  removeIncomingFriendRequest,
  removeOutgoingFriendRequest,
  acceptFriendRequest,
  removeFriend,
  updateMe,
  setFans,
  setFollowing,
  setVisitors,
  setBlockedUsers,
  addBlockedUser,
  removeBlockedUser,
  setSocketId,
  changeUserStatus,
  changeUserLastSeen,
  setSenderReactions,
  addSenderReaction,
  removeSenderReaction,
} = userSlice.actions;

export const selectUsers = (state) => state.users;

export default userSlice.reducer;
