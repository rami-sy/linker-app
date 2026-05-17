import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ar from "./ar.json";
import tr from "./tr.json";
import es from "./es.json";
import fr from "./fr.json";
import ru from "./ru.json";
import zh from "./zh.json";
import hi from "./hi.json";

const resources = {
  en: en,
  ar: ar,
  tr: tr,
  es: es,
  fr: fr,
  ru: ru,
  zh: zh,
  hi: hi,
};

i18n.use(initReactI18next).init({
  compatibilityJSON: "v3",
  resources,
  lng: "en", // Default language
  fallbackLng: "en", // Fallback language if the current language fails
  interpolation: {
    escapeValue: false, // React already safes from XSS
  },
});

export default i18n;
