import React, { useState } from "react";
import { Text, View, TouchableOpacity, ScrollView } from "react-native";
import { upperFirst } from "lodash";
import FeIcon from "react-native-vector-icons/Feather";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";

const Collapse = ({
  label,
  items,
  multiple = false, // Indicates if multiple selections are allowed
  error,
  onChange,
  withLabel = true,
  value,
  clear,
  valueKey = "_id",
  onClear,
}) => {
  const [collapse, setCollapse] = useState(false);
  const MAX_DISPLAY_ITEMS = 1; // Maximum number of items to display before truncating

  const handleSelectOption = (selectedItem) => {
    onChange(selectedItem);
    setCollapse(false);
  };

  const renderSelectedItems = () => {
    if (!multiple || !value) return null;

    const selectedItems = value.map((val) =>
      items.find((item) => item[valueKey] === val)
    );
    const displayItems = selectedItems
      .slice(0, MAX_DISPLAY_ITEMS)
      .map((item) => item?.name || item); // Display names instead of IDs
    const remainingCount = selectedItems.length - MAX_DISPLAY_ITEMS;

    return (
      <Text className={`text-base text-slate-200`}>
        {displayItems.join(", ")}
        {remainingCount > 0 && `, +${remainingCount} more`}
      </Text>
    );
  };
  const { t } = useTranslation();
  const renderSingleItem = () => {
    if (!value) return t("general.selectCategories");
    const selectedItem = items.find((item) => item[valueKey] === value);
    return selectedItem?.name || value;
  };
  const { isDarkColorScheme } = useColorScheme();
  return (
    <View
      className={`${
        collapse ? "z-10" : ""
      } flex-row items-center justify-between w-full mb-6`}
    >
      <View className={`flex-row items-center justify-start`}>
        {clear && value && value.length > 0 && (
          <TouchableOpacity
            className={`flex-row items-center justify-between w-auto`}
            onPress={() => onClear()}
          >
            <FeIcon
              name="x"
              size={20}
              color={isDarkColorScheme ? "#f56800" : "#ef233c"}
            />
          </TouchableOpacity>
        )}
        {withLabel && error ? (
          <Text
            className="mb-1 ml-2 text-base text-[#ef233c] dark:text-[#f56800]"
          >
            {error}
          </Text>
        ) : (
          withLabel && (
            <Text
              className="mb-1 ml-2 text-base text-placehoder dark:text-papaya"
            >
              {label}
            </Text>
          )
        )}
      </View>
      <View className={`relative`}>
        <View className={`flex flex-row items-center justify-between`}>
          <TouchableOpacity
            className={`flex-row items-center justify-between w-auto px-2 py-2 bg-[#0a97b9] rounded-2xl`}
            onPress={() => setCollapse(!collapse)}
          >
            <View className={`flex-row items-center`}>
              {multiple && typeof value === "object" ? (
                value?.length ? (
                  renderSelectedItems()
                ) : (
                  <Text className={`text-base text-slate-200`}>
                    {t("general.selectCategories")}
                  </Text>
                )
              ) : (
                <Text className={`text-base text-slate-200`}>
                  {renderSingleItem()}
                </Text>
              )}
            </View>
            <View className={`flex-row items-center ml-1`}>
              <FeIcon
                name={collapse ? "chevron-up" : "chevron-down"}
                size={20}
                color="#dee4e6"
              />
            </View>
          </TouchableOpacity>
        </View>

        {collapse && (
          <ScrollView
            className="absolute mt-2 bg-[#f6f8f9] dark:bg-sec border-slate-600 shadow border rounded-2xl top-8 max-h-[200px] overflow-scroll w-full"
          >
            {items.map((item, index) => (
              <TouchableOpacity
                key={item[valueKey] || index}
                className={`px-3 py-2 ${
                  multiple
                    ? value?.includes(item[valueKey])
                      ? "bg-[#0a97b9]"
                      : "bg-[#f6f8f9] dark:bg-sec"
                    : value === item[valueKey]
                    ? "bg-[#0a97b9]"
                    : "bg-[#f6f8f9] dark:bg-sec"
                }`}
                onPress={() => handleSelectOption(item?.[valueKey])}
              >
                <Text
                  className={`text-base text-placehoder dark:text-papaya ${
                    multiple
                      ? value?.includes(item?.[valueKey] || item)
                        ? "text-papaya"
                        : ""
                      : value === (item?.[valueKey] || item)
                      ? "text-papaya"
                      : ""
                  }`}
                >
                  {upperFirst(item.name || item)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

export default Collapse;
