// components/elements/addons/GoogleTranslate.tsx
import Script from "next/script";
import { useEffect } from "react";

// Extend the global window interface to declare the custom property
declare global {
  interface Window {
    initializeGoogleTranslateElement: () => void;
    google: any; // Declare google as any since TypeScript does not know about it
  }
}

const GoogleTranslate = () => {
  useEffect(() => {
    const setTranslateCookie = () => {
      document.cookie = "googtrans=/en/ja";
    };

    setTranslateCookie();

    // Initialize Google Translate after the script has loaded
    window.initializeGoogleTranslateElement = () => {
      if (window.google && window.google.translate) {
        new window.google.translate.TranslateElement(
          { pageLanguage: "en" },
          "google_translate_element"
        );
      }
    };
  }, []);

  return (
    <>
      <Script
        src="//translate.google.com/translate_a/element.js?cb=initializeGoogleTranslateElement"
        strategy="afterInteractive"
      />
      <div
        id="google_translate_element"
        style={{ display: "none", visibility: "hidden" }}
      ></div>
    </>
  );
};

export default GoogleTranslate;
