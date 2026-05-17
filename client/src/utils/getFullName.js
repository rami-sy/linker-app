import { upperFirst } from "lodash";

const getFullName = (user, onlyFirst = false, maxLength = 21) => {
  let fullName = "";

  if (user) {
    if (user.firstName) {
      fullName += upperFirst(user.firstName);
    }
    if (user.lastName && !onlyFirst) {
      fullName += " " + upperFirst(user.lastName);
    }

    if (fullName.length === 0) {
      fullName =
        (user.userName ? upperFirst(user.userName) : "") ||
        user.email ||
        user.phoneNumber ||
        "User";
    }
  }

  return fullName.length > maxLength
    ? fullName.slice(0, maxLength) + "..."
    : fullName;
};

export default getFullName;
