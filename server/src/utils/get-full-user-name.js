const { upperFirst } = require("lodash");
const getFullName = (user, onlyFirst = false) => {
  let fullName = "";

  if (user) {
    if (user.firstName) {
      fullName += upperFirst(user.firstName);
    }
    if (user.lastName && !onlyFirst) {
      fullName += " " + upperFirst(user.lastName);
    }

    if (fullName.length === 0) {
      fullName = user.userName || user.email || user.phoneNumber || "User";
    }
  }

  return fullName.length > 12 ? fullName.slice(0, 12) + "..." : fullName;
};

module.exports = getFullName;
