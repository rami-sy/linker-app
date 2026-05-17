/** Stable string id for Redux/socket matching (ObjectId, { _id }, { $oid }, string). */
export default function normalizeMongoId(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    if (value._id != null) return String(value._id);
    if (value.$oid != null) return String(value.$oid);
  }
  return String(value);
}
