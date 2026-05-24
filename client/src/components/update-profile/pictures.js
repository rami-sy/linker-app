import {
  View,
  ScrollView,
  Image,
  TouchableOpacity,
  Text,
} from "react-native";
import Modal from "../modal";
import React, { useEffect, useState } from "react";

import Joi from "joi";
import { useSelector, useDispatch } from "react-redux";
import { getMe, updateProfile } from "../../api/me";
import {
  setFormData,
  setErrors,
  setLoading,
  resetForm,
  selectFormData,
  selectFormErrors,
  selectIsLoading,
} from "../../redux/formSlice";
import MDCIcon from "@expo/vector-icons/MaterialCommunityIcons";
import FeIcon from "@expo/vector-icons/Feather";
import { postFile } from "../../api/files";
import * as ImagePicker from "expo-image-picker";
import { setMe } from "../../redux/userSlice";
import IconButton from "../icon-button";
import ImageViewer from "react-native-image-zoom-viewer";
import Constants from "expo-constants";
import { useColorScheme } from "../../../lib/useColorScheme";
import { useTranslation } from "react-i18next";
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;
const Pictures = ({ withLabel = false }) => {
  const dispatch = useDispatch();
  const formData = useSelector(selectFormData);
  const { user } = useSelector((state) => state.users);
  const [showModal, setShowModal] = useState(false);
  const [imagesIndex, setImagesIndex] = useState(0);
  const { isDarkColorScheme } = useColorScheme();
  useEffect(() => {
    if (user) {
      dispatch(setFormData(user));
    }

    return () => {
      dispatch(resetForm());
    };
  }, [user, dispatch]);

  const schema = Joi.object({}).unknown(true);

  const pickImage = async () => {
    // فتح معرض الصور
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
      base64: true,
    });

    if (!result.canceled) {
      // رفع الصورة إلى السيرفر
      const res = await postFile(result.assets[0].uri);

      if (res.type === "success") {
        // تحديث البيانات مباشرة بعد رفع الصورة
        const updatedImages = [{...res.data, index: 0}, ...formData?.images.map(
          (image, index) => ({...image, index: index + 1})
        )];
        dispatch(setFormData({ ...formData, images: updatedImages }));
        const { error } = schema.validate(formData, { abortEarly: false });
        if (error) {
          const errorData = {};
          error.details.forEach((item) => {
            errorData[item.path[0]] = item.message;
          });

          dispatch(setErrors(errorData));
          return;
        } else {
          dispatch(setErrors({}));
        }

        // تحديث الملف الشخصي تلقائيًا بعد إضافة الصورة
        try {
          const updateRes = await updateProfile({
            ...formData,
            images: updatedImages,
          });

          if (updateRes.type === "success") {
            const data = await getMe();
            if (data.type === "success") {
              dispatch(setMe(data.data));
            }
          }
        } catch (error) {
          console.error("Error updating profile after uploading image", error);
        }
      }
    }
  };
  

  const moveImage = async  (index, direction) => {
    const newImages = [...formData.images];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < newImages.length) {
      const temp = newImages[targetIndex];
      newImages[targetIndex] = {...newImages[index], index: targetIndex};
      newImages[index] = {...temp, index: index};

      dispatch(setFormData({ ...formData, images: newImages }));
      const { error } = schema.validate(formData, { abortEarly: false });
      if (error) {
        const errorData = {};
        error.details.forEach((item) => {
          errorData[item.path[0]] = item.message;
        });
        dispatch(setErrors(errorData));
        return;
      } else {
        dispatch(setErrors({}));
      }
      try {
        const updateRes = await updateProfile({
          ...formData,
          images: newImages,
        });
        if (updateRes.type === "success") {
          const data = await getMe();
          if (data.type === "success") {
            dispatch(setMe(data.data));
          }
        } else {
          console.error("Error updating profile after moving image", updateRes.error);
        }

      } catch (error) {
        console.error("Error updating profile after moving image", error);
      } finally {
        dispatch(setErrors({}));
      }
    }
  };
  const { t } = useTranslation();
  return (
    <>
      <ScrollView
        contentContainerStyle={{
          marginTop: 8,
          marginBottom: 8,
        }}
        className={`mb-2 w-full`}
      >
        <Modal
          showModal={showModal}
          setShowModal={setShowModal}
          onCancel={() => setShowModal(false)}
          opacity="90"
          animationType="fade"
        >
          <View className="relative h-full w-full">
            <ImageViewer
              renderArrowLeft={() => null}
              renderArrowRight={() => null}
              index={imagesIndex}
              imageUrls={formData?.images?.map((image) => ({
                url: apiUrl + image.path,
              }))}
            />
            <TouchableOpacity
              onPress={() => setShowModal(false)}
              className="absolute right-4 top-4 z-30 rounded-full bg-black/45 p-2"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FeIcon name="x" size={22} color="#f6f8f9" />
            </TouchableOpacity>
          </View>
        </Modal>
        {withLabel && (
          <Text
            className="mb-1 w-fit ml-2 text-base text-placehoder dark:text-papaya"
          >
            {t("UpdateProfile.pictures")}
          </Text>
        )}
        <View className={`flex-row flex-wrap items-start gap-2`}>
          {formData?.images?.map((image, index) => (
            <TouchableOpacity
              key={image._id}
              className="w-[30%] items-center justify-start border border-dashed border-gray-500 dark:border-gray-300 rounded-2xl"
              onPress={() => {
                setShowModal(true);
                setImagesIndex(index);
              }}
            >
              <Image
                source={{ uri: apiUrl + image.path }}
                className={`items-center justify-center w-full h-28 rounded-2xl bg-sec`}
                resizeMode="cover"
              />

              <TouchableOpacity
                className={`absolute top-1 w-full z-20 flex-row 
                 items-center ${index === 0 ? "justify-end" : "justify-between"}
                `}
              >
                {index !== 0 && (
                  <IconButton
                    iconName="chevron-up"
                    size={20}
                    iconComponent={FeIcon}
                    className={`w-8 h-8`}
                    onPress={() => moveImage(index, "up")}
                    disabled={index === 0}
                  />
                )}
                <IconButton
                  iconName="close"
                  size={20}
                  iconComponent={MDCIcon}
                  className={`w-8 h-8`}
                  onPress={async () => {
                    dispatch(
                      setFormData({
                        ...formData,
                        images: formData.images.filter((img, i) => i !== index),
                      })
                    );
                    const { error } = schema.validate(formData, {
                      abortEarly: false,
                    });
                    if (error) {
                      const errorData = {};
                      error.details.forEach((item) => {
                        errorData[item.path[0]] = item.message;
                      });
                      dispatch(setErrors(errorData));
                      return;
                    } else {
                      dispatch(setErrors({}));
                    }
                    try {
                      const updateRes = await updateProfile({
                        ...formData,
                        images: formData.images.filter((img, i) => i !== index),
                      });
                      if (updateRes.type === "success") {
                        const data = await getMe();
                        if (data.type === "success") {
                          dispatch(setMe(data.data));
                        }
                      } else {
                        console.error("Error updating profile after deleting image", updateRes.error);
                      }
                    } catch (error) {
                      console.error("Error updating profile after deleting image", error);
                    } finally {
                      dispatch(setErrors({}));
                    }
                  }}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          <View className={`w-[30%] items-start justify-start`}>
            <TouchableOpacity
              className="items-center justify-center w-full h-28 rounded-2xl bg-[#f6f8f9] dark:bg-sec"
              onPress={pickImage}
            >
              <FeIcon
                name="upload"
                size={30}
                color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </>
  );
};

export default Pictures;
