import { clsx } from "clsx";

/**
 * Utility function to merge Tailwind classes
 * Uses clsx for class merging (simplified - no tailwind-merge needed)
 */
export function cn(...inputs) {
  return clsx(inputs);
}


