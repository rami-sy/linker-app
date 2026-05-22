function checkLogin() {
  // Check if the user is logged in
  // For example, check if there is a token in the local storage
  const token = localStorage.getItem("accessToken");
  if (token) {
    setIsLoggedIn(true);
  } else {
    setIsLoggedIn(false);
  }
}

export default checkLogin;
