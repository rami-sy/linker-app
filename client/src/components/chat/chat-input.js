import React, { useState } from "react";
import { I18nManager } from "react-native";

import { useColorScheme } from "../../../lib/useColorScheme";
import useChatComposer from "../../hooks/useChatComposer";
import ChatComposerMain from "./composer/ChatComposerMain";
import ChatComposerModals from "./composer/ChatComposerModals";

const ChatInput = ({
  message,
  setMessage,
  handleTextChange,
  setSelectedMessage,
  showAttachment,
  setShowAttachment,
  fullInput = true,
  onSend = null,
  msgToReply,
  setMsgToReply,
  recording,
  setRecording,
  startRecording,
  stopRecording,
  duration,
  scrollToEnd,
  onJumpToQuotedMessage,
  activeThreadRootId = null,
}) => {
  const [showEmoji, setShowEmoji] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { isDarkColorScheme } = useColorScheme();
  const isRTL = I18nManager.isRTL;

  const composer = useChatComposer({
    message,
    setMessage,
    handleTextChange,
    setSelectedMessage,
    showAttachment,
    setShowAttachment,
    onSend,
    msgToReply,
    setMsgToReply,
    recording,
    scrollToEnd,
    activeThreadRootId,
  });

  return (
    <>
      <ChatComposerMain
        message={message}
        setMessage={setMessage}
        handleTextChange={handleTextChange}
        msgToReply={msgToReply}
        setMsgToReply={setMsgToReply}
        showAttachment={showAttachment}
        setShowAttachment={setShowAttachment}
        fullInput={fullInput}
        onSend={onSend}
        recording={recording}
        setRecording={setRecording}
        startRecording={startRecording}
        stopRecording={stopRecording}
        duration={duration}
        onJumpToQuotedMessage={onJumpToQuotedMessage}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        isDarkColorScheme={isDarkColorScheme}
        isRTL={isRTL}
        t={composer.t}
        user={composer.user}
        room={composer.room}
        canSendMessages={composer.canSendMessages}
        canSendFiles={composer.canSendFiles}
        canSendMedia={composer.canSendMedia}
        youBlockedUser={composer.youBlockedUser}
        userBlockedYou={composer.userBlockedYou}
        mentionCtx={composer.mentionCtx}
        mentionSuggestions={composer.mentionSuggestions}
        insertMention={composer.insertMention}
        actionsDisabled={composer.actionsDisabled}
        moreActionOptions={composer.moreActionOptions}
        submitComposerMessage={composer.submitComposerMessage}
        dismissComposerOverlays={composer.dismissComposerOverlays}
        keyboardHeight={keyboardHeight}
        setKeyboardHeight={setKeyboardHeight}
      />
      <ChatComposerModals
        t={composer.t}
        isDarkColorScheme={isDarkColorScheme}
        schedule={composer.schedule}
        callSchedule={composer.callSchedule}
        gif={composer.gif}
        poll={composer.poll}
        sticker={composer.sticker}
        stickerPresets={composer.stickerPresets}
      />
    </>
  );
};

export default ChatInput;
