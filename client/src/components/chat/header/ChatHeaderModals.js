import React, { lazy } from "react";
import { router } from "expo-router";
import SuspenseWrapper from "../../../hoc/suspense-wrapper";
import ChatLockPasswordModal from "../chat-lock-password-modal";
import ScheduledMessagesPopup from "./ScheduledMessagesPopup";
import ChatSummaryPopup from "./ChatSummaryPopup";
import RescheduleMessagePopup from "./RescheduleMessagePopup";
import EditMessagePopup from "./EditMessagePopup";
import MuteDurationPopup from "./MuteDurationPopup";
import ChangeRolePopup from "./ChangeRolePopup";
import RemoveMemberConfirmPopup from "./RemoveMemberConfirmPopup";

const DeleteChatPopup = lazy(() => import("../delete-chat-popup"));
const ForwardPopup = lazy(() => import("../forward-popup"));
const DeleteModalPopup = lazy(() => import("../delete-modal-popup"));
const AddMemberPopup = lazy(() => import("../add-member-popup"));
const BlockUserPopup = lazy(() => import("../block-user-popup"));
const ReportUserPopup = lazy(() => import("../report-user-popup"));
const InChatSearchPopup = lazy(() => import("../in-chat-search-popup"));
const ClearChatPopup = lazy(() => import("../clear-chat-popup"));
const GroupDetailsPopup = lazy(() => import("../group-details-popup"));
const GroupSettingsPopup = lazy(() => import("../group-settings-popup"));
const CallSettingsPopup = lazy(() => import("../call-settings-popup"));
const ChatSettingsPopup = lazy(() => import("../chat-settings-popup"));
const CallRejoinPanel = lazy(() => import("../../call-rejoin-panel"));

/**
 * All chat header overlays: forward, settings, group admin, scheduled messages, etc.
 */
export default function ChatHeaderModals({
  forward,
  setForward,
  forwardList,
  deleteModal,
  setDeleteModal,
  selectedMessages,
  onDeleteMessage,
  addMember,
  setAddMember,
  handleAddMember,
  blockModal,
  setBlockModal,
  youBlockedUser,
  reportModal,
  setReportModal,
  inChatSearchOpen,
  setInChatSearchOpen,
  onJumpToMessageKey,
  scheduledMessagesOpen,
  setScheduledMessagesOpen,
  scheduledMessages,
  setScheduledMessages,
  scheduledMessagesLoading,
  scheduledE2eePlaintext,
  scheduledDecryptDone,
  setRescheduleMessage,
  cancelScheduledMessage,
  chatSummaryOpen,
  setChatSummaryOpen,
  chatSummaryData,
  openChatSummary,
  rescheduleMessage,
  rescheduleScheduledMessage,
  editingMessage,
  setEditingMessage,
  setSelectedMessages,
  clearChatModal,
  setClearChatModal,
  deleteChatModal,
  setDeleteChatModal,
  showMuteModal,
  setShowMuteModal,
  muteDurations,
  handleMuteChat,
  lockModal,
  setLockModal,
  password,
  setPassword,
  rooms,
  roomId,
  groupDetailsModal,
  setGroupDetailsModal,
  showConfirmRole,
  setShowConfirmRole,
  showDeleteMember,
  setShowDeleteMember,
  selectedMember,
  setSelectedMember,
  selectedNewRole,
  setSelectedNewRole,
  setWasGroupDetailsModalOpen,
  handleCreateRoomWithMember,
  returnToGroupDetails,
  setReturnToGroupDetails,
  groupSettingsModal,
  setGroupSettingsModal,
  groupName,
  setGroupName,
  editRoom,
  setEditeRoom,
  pickImage,
  handleSaveGroupName,
  callSettingsModal,
  setCallSettingsModal,
  chatSettingsModal,
  setChatSettingsModal,
  rejoinPanelOpen,
  setRejoinPanelOpen,
  room,
  user,
  socket,
  dispatch,
  emitWithAck,
  editMessage,
  t,
  i18n,
  isDarkColorScheme,
  addAlert,
}) {
  return (
    <SuspenseWrapper>
      {forward && (
        <ForwardPopup
          showModal={forward}
          setShowModal={setForward}
          list={forwardList.list}
          handlePress={forwardList.handlePress}
          handleSearch={forwardList.handleSearch}
          handleLoadMore={forwardList.handleLoadMore}
          onRefresh={forwardList.onRefresh}
          refreshing={forwardList.refreshing}
          loading={forwardList.loading}
          search={forwardList.search}
          PAGE_SIZE={forwardList.PAGE_SIZE}
          setPage={forwardList.setPage}
        />
      )}

      {deleteModal && (
        <DeleteModalPopup
          showModal={deleteModal}
          setShowModal={setDeleteModal}
          selectedMessages={selectedMessages}
          onDeleteMessage={onDeleteMessage}
        />
      )}

      {addMember && (
        <AddMemberPopup
          showModal={addMember}
          setShowModal={setAddMember}
          list={forwardList.list}
          handleAddMember={handleAddMember}
          handleSearch={forwardList.handleSearch}
          handleLoadMore={forwardList.handleLoadMore}
          loading={forwardList.loading}
          search={forwardList.search}
          PAGE_SIZE={forwardList.PAGE_SIZE}
          onRefresh={forwardList.onRefresh}
          returnToGroupDetails={returnToGroupDetails}
          setReturnToGroupDetails={setReturnToGroupDetails}
          setGroupDetailsModal={setGroupDetailsModal}
        />
      )}

      {blockModal && (
        <BlockUserPopup
          showModal={blockModal}
          setShowModal={setBlockModal}
          youBlockedUser={youBlockedUser}
          room={room}
          user={user}
          socket={socket}
          dispatch={dispatch}
          t={t}
        />
      )}

      {reportModal && (
        <ReportUserPopup
          showModal={reportModal}
          setShowModal={setReportModal}
          room={room}
        />
      )}

      {inChatSearchOpen && onJumpToMessageKey && (
        <InChatSearchPopup
          showModal={inChatSearchOpen}
          setShowModal={setInChatSearchOpen}
          roomId={room?._id}
          emitWithAck={emitWithAck}
          onSelectMessageKey={onJumpToMessageKey}
        />
      )}

      <ScheduledMessagesPopup
        open={scheduledMessagesOpen}
        setOpen={setScheduledMessagesOpen}
        t={t}
        i18n={i18n}
        isDarkColorScheme={isDarkColorScheme}
        loading={scheduledMessagesLoading}
        scheduledMessages={scheduledMessages}
        setScheduledMessages={setScheduledMessages}
        e2eePlaintext={scheduledE2eePlaintext}
        decryptDone={scheduledDecryptDone}
        room={room}
        onReschedule={setRescheduleMessage}
        cancelScheduledMessage={cancelScheduledMessage}
      />

      <ChatSummaryPopup
        open={chatSummaryOpen}
        setOpen={setChatSummaryOpen}
        t={t}
        chatSummaryData={chatSummaryData}
        onRefresh={openChatSummary}
      />

      <RescheduleMessagePopup
        message={rescheduleMessage}
        setMessage={setRescheduleMessage}
        t={t}
        isDarkColorScheme={isDarkColorScheme}
        roomId={room?._id}
        rescheduleScheduledMessage={rescheduleScheduledMessage}
        setScheduledMessages={setScheduledMessages}
        dispatch={dispatch}
        addAlert={addAlert}
      />

      <EditMessagePopup
        editingMessage={editingMessage}
        setEditingMessage={setEditingMessage}
        setSelectedMessages={setSelectedMessages}
        t={t}
        roomId={room?._id}
        editMessage={editMessage}
        dispatch={dispatch}
        addAlert={addAlert}
      />

      {clearChatModal && (
        <ClearChatPopup
          showModal={clearChatModal}
          setShowModal={setClearChatModal}
          room={room}
          user={user}
          socket={socket}
          dispatch={dispatch}
          t={t}
        />
      )}

      {deleteChatModal && (
        <DeleteChatPopup
          showModal={deleteChatModal}
          setShowModal={setDeleteChatModal}
          room={room}
          user={user}
          socket={socket}
        />
      )}

      <MuteDurationPopup
        open={showMuteModal}
        setOpen={setShowMuteModal}
        t={t}
        muteDurations={muteDurations}
        onSelectDuration={handleMuteChat}
      />

      {lockModal && (
        <ChatLockPasswordModal
          mode={lockModal}
          password={password}
          onPasswordChange={setPassword}
          onClose={() => {
            setLockModal(null);
            setPassword("");
          }}
          onConfirm={async () => {
            if (lockModal !== "enter") return;
            const targetRoom = rooms.find((r) => r._id === roomId);
            const userPassword = targetRoom?.passwords?.find(
              (p) => p?.user === user?._id
            );
            if (password !== userPassword?.password) {
              setPassword("");
              dispatch(
                addAlert({
                  message: t("general.passwordIsNotCorrect"),
                  type: "error",
                })
              );
              return;
            }
            socket.emit("getMessages", { room: roomId, override: true });
            router.push(`/chats/${roomId}`);
            setLockModal(null);
            setPassword("");
          }}
        />
      )}

      {groupDetailsModal && (
        <GroupDetailsPopup
          showModal={groupDetailsModal}
          setShowModal={setGroupDetailsModal}
          room={room}
          user={user}
          setAddMember={setAddMember}
          setGroupDetailsModal={setGroupDetailsModal}
          setReturnToGroupDetails={setReturnToGroupDetails}
          dispatch={dispatch}
          setShowConfirmRole={setShowConfirmRole}
          setShowDeleteMember={setShowDeleteMember}
          setSelectedMember={setSelectedMember}
          setWasGroupDetailsModalOpen={setWasGroupDetailsModalOpen}
          onCreateRoomWithMember={handleCreateRoomWithMember}
        />
      )}

      <ChangeRolePopup
        open={showConfirmRole}
        setOpen={setShowConfirmRole}
        t={t}
        room={room}
        user={user}
        selectedMember={selectedMember}
        selectedNewRole={selectedNewRole}
        setSelectedNewRole={setSelectedNewRole}
        socket={socket}
        dispatch={dispatch}
        addAlert={addAlert}
      />

      <RemoveMemberConfirmPopup
        open={showDeleteMember}
        setOpen={setShowDeleteMember}
        t={t}
        room={room}
        selectedMember={selectedMember}
        socket={socket}
        dispatch={dispatch}
        addAlert={addAlert}
      />

      {groupSettingsModal && (
        <GroupSettingsPopup
          showModal={groupSettingsModal}
          setShowModal={setGroupSettingsModal}
          room={room}
          groupName={groupName}
          setGroupName={setGroupName}
          setEditeRoom={setEditeRoom}
          editRoom={editRoom}
          pickImage={pickImage}
          handleSaveGroupName={handleSaveGroupName}
        />
      )}

      {callSettingsModal && (
        <SuspenseWrapper>
          <CallSettingsPopup
            showModal={callSettingsModal}
            setShowModal={setCallSettingsModal}
          />
        </SuspenseWrapper>
      )}

      {chatSettingsModal && (
        <SuspenseWrapper>
          <ChatSettingsPopup
            showModal={chatSettingsModal}
            setShowModal={setChatSettingsModal}
          />
        </SuspenseWrapper>
      )}

      {rejoinPanelOpen && room?._id && (
        <SuspenseWrapper>
          <CallRejoinPanel
            visible={rejoinPanelOpen}
            onClose={() => setRejoinPanelOpen(false)}
            room={room}
          />
        </SuspenseWrapper>
      )}
    </SuspenseWrapper>
  );
}
