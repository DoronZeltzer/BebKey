import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '../locales/en.json'
import he from '../locales/he.json'
import ru from '../locales/ru.json'
import ar from '../locales/ar.json'
import fr from '../locales/fr.json'

const savedLang = localStorage.getItem('lang') || 'he'

// Apply RTL/LTR immediately on load so every page refresh has the correct direction
document.documentElement.dir  = savedLang === 'he' || savedLang === 'ar' ? 'rtl' : 'ltr'
document.documentElement.lang = savedLang

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
    ru: { translation: ru },
    ar: { translation: ar },
    fr: { translation: fr },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
