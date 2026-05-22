import { useEffect, useState } from "react";
import { loadOrCreateDeviceKeys } from "../crypto/e2eeDevice";
import { tryDecryptChatMessage } from "../crypto/e2eeMessageHelpers";
import {
  findScheduledMessageInRoomMap,
  scheduledMessagePlainBody,
} from "../utils/scheduledMessagePreview";

/**
 * Loads scheduled messages for a room and decrypts E2EE previews when the list opens.
 */
export default function useScheduledMessages({
  open,
  room,
  socket,
  user,
  getScheduledMessages,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [e2eePlaintext, setE2eePlaintext] = useState({});
  const [decryptDone, setDecryptDone] = useState(false);

  useEffect(() => {
    if (!open || !room?._id || !getScheduledMessages) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await getScheduledMessages({ room: room._id });
      if (cancelled) return;
      if (res?.type === "success" && Array.isArray(res?.messages)) {
        setMessages(res.messages);
      } else {
        setMessages([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, room?._id, getScheduledMessages]);

  useEffect(() => {
    if (!open) {
      setE2eePlaintext({});
      setDecryptDone(false);
      return undefined;
    }
    if (!room?._id || !socket || !user?._id || !messages.length) {
      setDecryptDone(true);
      return undefined;
    }
    let cancelled = false;
    setE2eePlaintext({});
    setDecryptDone(false);
    (async () => {
      let dk;
      try {
        dk = await loadOrCreateDeviceKeys();
      } catch {
        if (!cancelled) setDecryptDone(true);
        return;
      }
      const roomMsgs = room?.messages || {};
      const additions = {};
      await Promise.all(
        messages.map(async (msg) => {
          const local = findScheduledMessageInRoomMap(msg, roomMsgs);
          const plain = scheduledMessagePlainBody(msg, local);
          if (plain || !msg?.e2ee?.ciphertext) return;
          try {
            const dec = await tryDecryptChatMessage(
              msg,
              room._id,
              room?.e2ee,
              socket,
              user._id,
              dk
            );
            if (dec?.e2eeDecryptFailed) return;
            const raw = dec?.text != null ? String(dec.text) : "";
            const body = raw.replace(/^💬\s*/, "").trim();
            if (body && !/^🔒/u.test(body)) {
              additions[String(msg._id)] = body;
            }
          } catch {
            /* ignore per-message decrypt errors */
          }
        })
      );
      if (!cancelled) {
        setE2eePlaintext(additions);
        setDecryptDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, messages, room?._id, room?.e2ee, room?.messages, socket, user?._id]);

  return {
    messages,
    setMessages,
    loading,
    e2eePlaintext,
    decryptDone,
  };
}
