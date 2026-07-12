import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export const supportedLanguages = ['en', 'de'] as const
export type Language = (typeof supportedLanguages)[number]

export type TranslationShape<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: TranslationShape<T[K]> }
    : T extends object
      ? { readonly [K in keyof T]: TranslationShape<T[K]> }
      : T

export type MessageBundle<T> = Readonly<{
  en: T
  de: TranslationShape<T>
}>

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
}

function validateTranslation(source: unknown, translated: unknown, path = 'messages'): void {
  if (typeof source === 'string') {
    if (typeof translated !== 'string') throw new Error(`i18n: ${path} must be a string`)
    const expected = placeholders(source)
    const actual = placeholders(translated)
    if (expected.join('\0') !== actual.join('\0')) {
      throw new Error(`i18n: placeholder mismatch at ${path}; expected {${expected.join('}, {')}} but received {${actual.join('}, {')}}`)
    }
    return
  }
  if (Array.isArray(source)) {
    if (!Array.isArray(translated) || translated.length !== source.length) {
      throw new Error(`i18n: tuple length mismatch at ${path}`)
    }
    source.forEach((value, index) => validateTranslation(value, translated[index], `${path}[${index}]`))
    return
  }
  if (source && typeof source === 'object') {
    if (!translated || typeof translated !== 'object' || Array.isArray(translated)) {
      throw new Error(`i18n: object mismatch at ${path}`)
    }
    const sourceKeys = Object.keys(source)
    const translatedKeys = Object.keys(translated)
    if (sourceKeys.length !== translatedKeys.length || sourceKeys.some((key) => !translatedKeys.includes(key))) {
      throw new Error(`i18n: key mismatch at ${path}`)
    }
    sourceKeys.forEach((key) => validateTranslation(
      (source as Record<string, unknown>)[key],
      (translated as Record<string, unknown>)[key],
      `${path}.${key}`,
    ))
    return
  }
  if (typeof source !== typeof translated) throw new Error(`i18n: value mismatch at ${path}`)
}

/**
 * Defines a bilingual resource with compile-time key, tuple, and value-shape
 * parity. Keeping resources close to their feature lets views migrate without
 * growing one conflict-prone global dictionary.
 */
export function defineMessages<const English>(
  en: English,
  de: TranslationShape<English>,
): MessageBundle<English> {
  validateTranslation(en, de)
  return { en, de }
}

const LANGUAGE_STORAGE_KEY = 'apex:language'

type I18nContextValue = {
  language: Language
  setLanguage: (language: Language) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && supportedLanguages.includes(value as Language)
}

function initialLanguage(): Language {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // Storage can be unavailable in a hardened browser context.
  }
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    } catch {
      // The selected language still applies for the current session.
    }
  }, [language])

  const value = useMemo(() => ({ language, setLanguage }), [language])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}

export function useMessages<const English>(bundle: MessageBundle<English>): TranslationShape<English> {
  const { language } = useI18n()
  return bundle[language] as TranslationShape<English>
}

export function formatMessage(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ))
}
