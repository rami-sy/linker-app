import React from "react";
import { useSelector } from "react-redux";

const checkPrivacy = (user, privacySetting, section, currentUser) => {
  return (
    user?.privacySettings[section][privacySetting] === "everyone" ||
    (user?.privacySettings[section][privacySetting] === "friends" &&
      currentUser?.friends?.includes?.(user?._id))
  );
};

const Privacy = ({ children, privacySettings, section, user, render }) => {
  const { user: currentUser } = useSelector((state) => state.users);
  const condition = checkPrivacy(user, privacySettings, section, currentUser);
  if (!condition) {
    return render ? render : null; // Return null if the condition is false to render nothing
  }
  return <>{children}</>; // Return children wrapped in a Fragment
};

export default Privacy;
