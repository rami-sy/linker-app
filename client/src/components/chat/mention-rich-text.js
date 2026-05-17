import React from "react";
import { Text } from "react-native";

/**
 * Renders message text with @tokens highlighted when they match stored mention ids (same order as @ in text).
 */
export default function MentionRichText({
  text,
  mentionIds = [],
  className = "",
  mentionClassName = "text-sky-400 font-semibold",
}) {
  if (!text) return null;

  const parts = [];
  const re = /@(\S+)/g;
  let last = 0;
  let mi = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    const full = m[0];
    if (mi < (mentionIds?.length || 0) && mentionIds[mi]) {
      parts.push(
        <Text key={`m-${m.index}`} className={mentionClassName}>
          {full}
        </Text>
      );
      mi += 1;
    } else {
      parts.push(full);
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return (
    <Text className={className} style={{ wordBreak: "break-word" }}>
      {parts}
    </Text>
  );
}
