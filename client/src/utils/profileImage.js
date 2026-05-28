/**
 * Returns user profile images in display order (primary image first).
 * Prefers explicit `index` when present; otherwise preserves array order.
 */
export function getOrderedProfileImages(images = []) {
  if (!Array.isArray(images) || images.length === 0) return [];

  const withPath = images.filter((img) => img?.path);
  if (withPath.length === 0) return [];

  const hasIndex = withPath.some((img) => typeof img.index === "number");
  if (!hasIndex) return withPath;

  return [...withPath].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

export function getPrimaryProfileImage(images = []) {
  return getOrderedProfileImages(images)[0] ?? null;
}

export function getPrimaryProfileImagePath(images = []) {
  return getPrimaryProfileImage(images)?.path ?? null;
}
