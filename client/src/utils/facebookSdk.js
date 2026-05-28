const FACEBOOK_SDK_SCRIPT_ID = "facebook-jssdk";

let facebookSdkPromise;

export function loadFacebookSdk(appId) {
  if (typeof window === "undefined" || !appId) {
    return Promise.reject(new Error("Facebook SDK is not available"));
  }

  if (facebookSdkPromise) {
    return facebookSdkPromise;
  }

  facebookSdkPromise = new Promise((resolve, reject) => {
    const init = () => {
      if (!window.FB) {
        reject(new Error("Facebook SDK failed to load"));
        return;
      }

      window.FB.init({
        appId,
        cookie: false,
        xfbml: false,
        version: "v20.0",
      });
      resolve(window.FB);
    };

    if (window.FB) {
      init();
      return;
    }

    window.fbAsyncInit = init;

    if (document.getElementById(FACEBOOK_SDK_SCRIPT_ID)) {
      return;
    }

    const script = document.createElement("script");
    script.id = FACEBOOK_SDK_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Failed to load Facebook SDK"));
    document.body.appendChild(script);
  });

  return facebookSdkPromise;
}

export async function loginWithFacebook(appId) {
  const FB = await loadFacebookSdk(appId);

  return new Promise((resolve, reject) => {
    FB.login(
      (response) => {
        if (response?.authResponse?.accessToken) {
          resolve(response.authResponse.accessToken);
          return;
        }

        reject(new Error("Facebook login was cancelled"));
      },
      { scope: "public_profile,email" }
    );
  });
}
