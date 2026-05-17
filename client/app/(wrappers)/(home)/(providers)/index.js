import { Redirect } from "expo-router";

// ✅ Default route for (providers) group
// This prevents expo-router from flashing to update-profile.js (first alphabetical file)
// Redirects to (tabs) which is the main content area
export default function ProvidersIndex() {
  return <Redirect href="/(tabs)" />;
}


