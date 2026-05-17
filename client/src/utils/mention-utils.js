/**
 * Group @mentions: match @token after @ to room members (first name, userName, concatenated forms).
 */

function mentionCandidates(member) {
  if (!member) return [];
  const out = [];
  if (member.userName) {
    out.push(String(member.userName).replace(/^@/, ""));
  }
  if (member.firstName) {
    out.push(String(member.firstName).trim());
  }
  if (member.firstName && member.lastName) {
    const f = String(member.firstName).trim();
    const l = String(member.lastName).trim();
    out.push(`${f}${l}`);
    out.push(`${f}_${l}`);
    out.push(`${f} ${l}`);
  }
  return out.filter(Boolean);
}

function tokenMatchesMember(token, member, currentUserId) {
  if (!token || !member?._id) return false;
  if (String(member._id) === String(currentUserId)) return false;
  const t = token.trim().toLowerCase();
  if (!t) return false;
  return mentionCandidates(member).some(
    (c) => c && String(c).toLowerCase() === t
  );
}

/** Parse @tokens in order; returns user ids (Mongo/ObjectId compatible) for matched members. */
export function parseMentionUserIds(text, members, currentUserId) {
  if (!text || !Array.isArray(members)) return [];
  const re = /@(\S+)/g;
  let m;
  const ids = [];
  const seen = new Set();
  while ((m = re.exec(text)) !== null) {
    const token = m[1];
    const member = members.find((mem) =>
      tokenMatchesMember(token, mem, currentUserId)
    );
    if (member?._id) {
      const id = String(member._id);
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(member._id);
      }
    }
  }
  return ids;
}

/** Label inserted into the composer after picking a member (must match parseMentionUserIds). */
export function getMentionInsertLabel(member) {
  if (!member) return "user";
  if (member.firstName) return String(member.firstName).trim();
  if (member.userName) return String(member.userName).replace(/^@/, "");
  return "user";
}

/**
 * If the user is typing an @mention at the end, returns { query, startIndex } for filtering.
 * Otherwise null.
 */
export function getActiveMentionQuery(text) {
  if (typeof text !== "string" || !text.includes("@")) return null;
  const lastAt = text.lastIndexOf("@");
  if (lastAt < 0) return null;
  const after = text.slice(lastAt + 1);
  if (after.includes(" ") || after.includes("\n")) return null;
  return { query: after, startIndex: lastAt };
}
