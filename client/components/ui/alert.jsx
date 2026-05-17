import * as React from "react";
import { View, Text } from "react-native";
import { cn } from "~/lib/utils";

const Alert = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <View
      ref={ref}
      className={cn("relative w-full rounded-lg border p-4", className)}
      {...props}
    />
  );
});
Alert.displayName = "Alert";

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <Text
      ref={ref}
      className={cn("text-sm [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
});
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertDescription };


