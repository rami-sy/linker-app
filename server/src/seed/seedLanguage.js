const Language = require("../models/language.model");

const languageSeedData = [
  { name: "English", label: "English" },
  { name: "Spanish", label: "Español" },
  { name: "French", label: "Français" },
  { name: "German", label: "Deutsch" },
  { name: "Italian", label: "Italiano" },
  { name: "Portuguese", label: "Português" },
  { name: "Dutch", label: "Nederlands" },
  { name: "Russian", label: "Русский" },
  { name: "Chinese", label: "中文" },
  { name: "Japanese", label: "日本語" },
  { name: "Korean", label: "한국어" },
  { name: "Arabic", label: "العربية" },
  { name: "Hindi", label: "हिन्दी" },
  { name: "Bengali", label: "বাংলা" },
  { name: "Turkish", label: "Türkçe" },
  { name: "Vietnamese", label: "Tiếng Việt" },
  { name: "Polish", label: "Polski" },
  { name: "Persian", label: "فارسی" },
  { name: "Ukrainian", label: "Українська" },
  { name: "Swedish", label: "Svenska" },
  { name: "Indonesian", label: "Bahasa Indonesia" },
  { name: "Norwegian", label: "Norsk" },
  { name: "Danish", label: "Dansk" },
  { name: "Finnish", label: "Suomi" },
  { name: "Hebrew", label: "עברית" },
  { name: "Greek", label: "Ελληνικά" },
  { name: "Hungarian", label: "Magyar" },
  { name: "Czech", label: "Čeština" },
  { name: "Romanian", label: "Română" },
  { name: "Thai", label: "ไทย" },
  { name: "Slovak", label: "Slovenčina" },
  { name: "Bulgarian", label: "Български" },
  { name: "Serbian", label: "Српски" },
];

async function seedLanguages() {
  try {
    const languages = await Language.find();
    if (languages.length === 0) {
      console.log("No languages found, seeding...");
      await Language.insertMany(
        // languageSeedData remove the duplicate languages
        languageSeedData.filter(
          (language, index, self) =>
            index ===
            self.findIndex(
              (t) => t.name.toLowerCase() === language.name.toLowerCase()
            )
        )
      );
      console.log("Languages have been successfully seeded.");
    } else {
      // delete all languages
      // await Language.deleteMany({});
      console.log("Languages already exist.");
    }
  } catch (error) {
    console.error("Error seeding languages:", error);
  }
}

module.exports = seedLanguages;
