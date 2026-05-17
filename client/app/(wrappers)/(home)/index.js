import { Redirect } from "expo-router";

// ✅ Default route for (home) group
// Redirects to (providers) which contains the main app content
export default function HomeIndex() {
  return <Redirect href="/(providers)" />;
}


