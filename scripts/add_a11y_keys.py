"""Inject the a11y.* i18n keys into all 5 locale files."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT / "src" / "locales"

TRANSLATIONS = {
    "en": {
        "title": "Accessibility",
        "open": "Open accessibility menu",
        "close": "Close",
        "fontSize": "Text size",
        "contrastGroup": "Colour",
        "contentGroup": "Content",
        "navigationGroup": "Navigation",
        "contrast": "High contrast",
        "invert": "Inverted colours",
        "grayscale": "Grayscale",
        "highlightLinks": "Highlight links",
        "highlightHeads": "Highlight headings",
        "readableFont": "Readable font",
        "stopMotion": "Stop animations",
        "bigCursor": "Larger cursor",
        "readingGuide": "Reading guide",
        "reset": "Reset all adjustments",
        "statementLink": "Read full accessibility statement",
        "footerLink": "Accessibility",
    },
    "he": {
        "title": "נגישות",
        "open": "פתיחת תפריט נגישות",
        "close": "סגירה",
        "fontSize": "גודל טקסט",
        "contrastGroup": "צבע",
        "contentGroup": "תוכן",
        "navigationGroup": "ניווט",
        "contrast": "ניגודיות גבוהה",
        "invert": "צבעים הפוכים",
        "grayscale": "גווני אפור",
        "highlightLinks": "הדגשת קישורים",
        "highlightHeads": "הדגשת כותרות",
        "readableFont": "גופן קריא",
        "stopMotion": "עצירת אנימציות",
        "bigCursor": "סמן גדול",
        "readingGuide": "קו עזר לקריאה",
        "reset": "איפוס כל ההתאמות",
        "statementLink": "קריאת הצהרת הנגישות המלאה",
        "footerLink": "נגישות",
    },
    "ru": {
        "title": "Доступность",
        "open": "Открыть меню доступности",
        "close": "Закрыть",
        "fontSize": "Размер текста",
        "contrastGroup": "Цвет",
        "contentGroup": "Содержимое",
        "navigationGroup": "Навигация",
        "contrast": "Высокий контраст",
        "invert": "Инверсия цветов",
        "grayscale": "Чёрно-белый режим",
        "highlightLinks": "Подсветить ссылки",
        "highlightHeads": "Подсветить заголовки",
        "readableFont": "Удобный для чтения шрифт",
        "stopMotion": "Остановить анимации",
        "bigCursor": "Увеличенный курсор",
        "readingGuide": "Направляющая для чтения",
        "reset": "Сбросить все настройки",
        "statementLink": "Читать полное заявление о доступности",
        "footerLink": "Доступность",
    },
    "ar": {
        "title": "إمكانية الوصول",
        "open": "فتح قائمة إمكانية الوصول",
        "close": "إغلاق",
        "fontSize": "حجم النص",
        "contrastGroup": "اللون",
        "contentGroup": "المحتوى",
        "navigationGroup": "التنقل",
        "contrast": "تباين عالٍ",
        "invert": "ألوان معكوسة",
        "grayscale": "تدرج الرمادي",
        "highlightLinks": "إبراز الروابط",
        "highlightHeads": "إبراز العناوين",
        "readableFont": "خط مقروء",
        "stopMotion": "إيقاف الحركة",
        "bigCursor": "مؤشر أكبر",
        "readingGuide": "خط مساعدة للقراءة",
        "reset": "إعادة تعيين جميع الإعدادات",
        "statementLink": "اقرأ بيان إمكانية الوصول الكامل",
        "footerLink": "إمكانية الوصول",
    },
    "fr": {
        "title": "Accessibilité",
        "open": "Ouvrir le menu d'accessibilité",
        "close": "Fermer",
        "fontSize": "Taille du texte",
        "contrastGroup": "Couleur",
        "contentGroup": "Contenu",
        "navigationGroup": "Navigation",
        "contrast": "Contraste élevé",
        "invert": "Couleurs inversées",
        "grayscale": "Niveaux de gris",
        "highlightLinks": "Surligner les liens",
        "highlightHeads": "Surligner les titres",
        "readableFont": "Police lisible",
        "stopMotion": "Arrêter les animations",
        "bigCursor": "Curseur agrandi",
        "readingGuide": "Guide de lecture",
        "reset": "Réinitialiser tous les réglages",
        "statementLink": "Lire la déclaration d'accessibilité complète",
        "footerLink": "Accessibilité",
    },
}

def main():
    for code, keys in TRANSLATIONS.items():
        path = LOCALES / f"{code}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["a11y"] = keys
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"  + a11y keys -> {path.name} ({len(keys)} strings)")

if __name__ == "__main__":
    main()
