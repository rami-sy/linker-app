import { Image, Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";

const CachedImage = (props) => {
  const {
    source: { uri },
    cacheKey,
    expiry = 30 * 24 * 60 * 60,
  } = props;
  const filesystemURI = `${FileSystem?.cacheDirectory}${cacheKey}`;

  const [imgURI, setImgURI] = useState(
    Platform.OS === "web" ? uri : filesystemURI
  ); // استخدم URI مباشر على الويب
  const componentIsMounted = useRef(true);

  useEffect(() => {
    const loadImage = async ({ fileURI }) => {
      if (Platform.OS === "web") {
        // لا تفعل أي شيء خاص على الويب لأن FileSystem غير مدعوم
        return;
      }

      try {
        const metadata = await FileSystem?.getInfoAsync(fileURI);
        if (
          metadata?.exists &&
          Date.now() - metadata?.modificationTime < expiry * 1000
        ) {
          setImgURI(fileURI); // استخدم الصورة من الكاش إذا كانت موجودة
        } else {
          if (componentIsMounted?.current) {
            setImgURI(null);
            if (uri.startsWith("http") || uri.startsWith("https")) {
              try {
                await FileSystem?.downloadAsync(uri, fileURI);
                setImgURI(fileURI); // تعيين الصورة المحملة في الكاش
              } catch (downloadError) {
                console.error("Error downloading image:", downloadError);
                setImgURI(uri); // تعيين URI مباشرة إذا فشل التنزيل
              }
            } else {
              console.error("Invalid URI scheme. Expected 'http' or 'https'.");
              setImgURI(uri); // تعيين URI مباشرة إذا كان غير صالح للتنزيل
            }
          }
        }
      } catch (err) {
        console.error("Error loading image:", err);
        if (componentIsMounted.current) {
          setImgURI(uri); // تحميل الصورة من الشبكة إذا حدث خطأ
        }
      }
    };

    loadImage({ fileURI: filesystemURI });

    return () => {
      componentIsMounted.current = false;
    };
  }, [uri, filesystemURI, expiry]);

  return (
    <Image
      {...props}
      source={{
        uri: imgURI,
      }}
      crossOrigin="anonymous"
    />
  );
};

CachedImage.propTypes = {
  source: PropTypes.shape({
    uri: PropTypes.string.isRequired,
  }).isRequired,
  cacheKey: PropTypes.string.isRequired,
  expiry: PropTypes.number, // وقت انتهاء الكاش بالثواني
};

export default CachedImage;
