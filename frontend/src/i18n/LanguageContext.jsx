import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { translations } from "./translations.js";

const LanguageContext = createContext(null);

const STORAGE_KEY = "lifehedge_lang";

export function LanguageProvider({ children }) {
  const [idioma, setIdioma] = useState(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado === "en" || guardado === "es") return guardado;
    } catch {
      // ignore
    }
    return "es";
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, idioma);
      document.documentElement.lang = idioma;
    } catch {
      // ignore
    }
  }, [idioma]);

  const cambiarIdioma = useCallback((nuevoIdioma) => {
    if (nuevoIdioma === "es" || nuevoIdioma === "en") {
      setIdioma(nuevoIdioma);
    }
  }, []);

  /**
   * Helper t(key, params, fallback)
   * e.g. t("cuenta.title") or t("cuenta.deleteConfirmMsg", { file: "bbva.pdf" })
   */
  const t = useCallback(
    (clave, params = {}, fallback = "") => {
      if (!clave) return fallback;
      const partes = clave.split(".");
      let actual = translations[idioma];
      for (const p of partes) {
        if (actual && typeof actual === "object" && p in actual) {
          actual = actual[p];
        } else {
          actual = null;
          break;
        }
      }

      // Si no existe en el idioma actual, buscar en español como fallback
      if (actual === null || actual === undefined) {
        let actualEs = translations.es;
        for (const p of partes) {
          if (actualEs && typeof actualEs === "object" && p in actualEs) {
            actualEs = actualEs[p];
          } else {
            actualEs = null;
            break;
          }
        }
        actual = actualEs ?? fallback ?? clave;
      }

      if (typeof actual !== "string") return actual ?? fallback ?? clave;

      // Reemplazo de parámetros {param}
      let texto = actual;
      if (params && typeof params === "object") {
        Object.entries(params).forEach(([k, v]) => {
          texto = texto.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }
      return texto;
    },
    [idioma]
  );

  const valor = {
    idioma,
    cambiarIdioma,
    t,
    esEspanol: idioma === "es",
    esIngles: idioma === "en",
  };

  return <LanguageContext.Provider value={valor}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback de seguridad si se usa fuera del Provider
    return {
      idioma: "es",
      cambiarIdioma: () => {},
      t: (k, _p, f) => f || k,
      esEspanol: true,
      esIngles: false,
    };
  }
  return ctx;
}
