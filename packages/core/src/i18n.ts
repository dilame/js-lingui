import { interpolate, UNICODE_REGEX } from "./interpolate"
import { isString, isFunction } from "./essentials"
import { date, defaultLocale, number } from "./formats"
import { EventEmitter } from "./eventEmitter"
import { compileMessage } from "@lingui/message-utils/compileMessage"
import type { CompiledMessage } from "@lingui/message-utils/compileMessage"
import {
  I18nT,
  I18nTDescriptorById,
  I18nTDescriptorByMessage,
  I18nTMessageWithNoParams,
  I18nTOptions,
  I18nTOptionsWithMessage,
} from "./i18n.t"

export type { CompiledMessage }
export type Locale = string
export type Locales = Locale | Locale[]
export type Formats = Record<
  string,
  Intl.DateTimeFormatOptions | Intl.NumberFormatOptions
>

export type Values = Record<string, unknown>

/**
 * @deprecated Plurals automatically used from Intl.PluralRules you can safely remove this call. Deprecated in v4
 */
export type LocaleData = {
  plurals?: (
    n: number,
    ordinal?: boolean
  ) => ReturnType<Intl.PluralRules["select"]>
}

/**
 * @deprecated Plurals automatically used from Intl.PluralRules you can safely remove this call. Deprecated in v4
 */
export type AllLocaleData = Record<Locale, LocaleData>

export type Messages = Record<string, CompiledMessage>

export type AllMessages = Record<Locale, Messages>

export type MissingMessageEvent = {
  locale: Locale
  id: string
}

type MissingHandler = string | ((locale: string, id: string) => string)

type setupI18nProps = {
  locale?: Locale
  locales?: Locales
  messages?: AllMessages
  /**
   * @deprecated Plurals automatically used from Intl.PluralRules you can safely remove this call. Deprecated in v4
   */
  localeData?: AllLocaleData
  missing?: MissingHandler
}

type Events = {
  change: () => void
  missing: (event: MissingMessageEvent) => void
}

type LoadAndActivateOptions = {
  /** initial active locale */
  locale: Locale
  /** list of alternative locales (BCP 47 language tags) which are used for number and date formatting */
  locales?: Locales
  /** compiled message catalog */
  messages: Messages
}

export class I18n extends EventEmitter<Events> {
  /**
   * Alias for {@see I18n._}
   */
  t: I18n["_"] = this._.bind(this)
  private _missing?: MissingHandler

  constructor(params: setupI18nProps) {
    super()

    if (params.missing != null) this._missing = params.missing
    if (params.messages != null) this.load(params.messages)
    if (params.localeData != null) this.loadLocaleData(params.localeData)
    if (typeof params.locale === "string" || params.locales) {
      this.activate(params.locale ?? defaultLocale, params.locales)
    }
  }

  private _locale: Locale = ""

  get locale() {
    return this._locale
  }

  private _locales?: Locales

  get locales() {
    return this._locales
  }

  private _localeData: AllLocaleData = {}

  /**
   * @deprecated this has no effect. Please remove this from the code. Deprecated in v4
   */
  get localeData(): LocaleData {
    return this._localeData[this._locale] ?? {}
  }

  private _messages: AllMessages = {}

  get messages(): Messages {
    return this._messages[this._locale] ?? {}
  }

  /**
   * @deprecated Plurals automatically used from Intl.PluralRules you can safely remove this call. Deprecated in v4
   */
  public loadLocaleData(allLocaleData: AllLocaleData): void
  /**
   * @deprecated Plurals automatically used from Intl.PluralRules you can safely remove this call. Deprecated in v4
   */
  public loadLocaleData(locale: Locale, localeData: LocaleData): void
  /**
   * @deprecated Plurals automatically used from Intl.PluralRules you can safely remove this call. Deprecated in v4
   */
  // @ts-ignore deprecated, so ignore the reported error
  loadLocaleData(localeOrAllData, localeData?) {
    if (localeData != null) {
      // loadLocaleData('en', enLocaleData)
      // Loading locale data for a single locale.
      this._loadLocaleData(localeOrAllData, localeData)
    } else {
      // loadLocaleData(allLocaleData)
      // Loading all locale data at once.
      Object.keys(localeOrAllData).forEach((locale) =>
        this._loadLocaleData(locale, localeOrAllData[locale])
      )
    }

    this.emit("change")
  }

  load(allMessages: AllMessages): void

  load(locale: Locale, messages: Messages): void

  load(localeOrMessages: AllMessages | Locale, messages?: Messages): void {
    if (typeof localeOrMessages == "string" && typeof messages === "object") {
      // load('en', catalog)
      // Loading a catalog for a single locale.
      this._load(localeOrMessages, messages)
    } else {
      // load(catalogs)
      // Loading several locales at once.
      Object.entries(localeOrMessages).forEach(([locale, messages]) =>
        this._load(locale, messages)
      )
    }

    this.emit("change")
  }

  /**
   * @param options {@link LoadAndActivateOptions}
   */
  loadAndActivate({ locale, locales, messages }: LoadAndActivateOptions) {
    this._locale = locale
    this._locales = locales || undefined

    this._messages[this._locale] = messages

    this.emit("change")
  }

  activate(locale: Locale, locales?: Locales) {
    if (process.env.NODE_ENV !== "production") {
      if (!this._messages[locale]) {
        console.warn(`Messages for locale "${locale}" not loaded.`)
      }
    }

    this._locale = locale
    this._locales = locales
    this.emit("change")
  }

  // method for translation and formatting
  _<Message extends string>(id: I18nTMessageWithNoParams<Message>): string
  _<Message extends string>(
    id: string,
    values: I18nT<Message>,
    options: I18nTOptionsWithMessage<Message>
  ): string
  _<Message extends string>(
    id: Message,
    values: I18nT<Message>,
    options?: I18nTOptions
  ): string
  _<Message extends string>(
    descriptor: I18nTDescriptorByMessage<Message>
  ): string
  _<Message extends string>(descriptor: I18nTDescriptorById<Message>): string
  _(
    id:
      | { id: string; message?: string; values?: Values; comment?: string }
      | string,
    values?: Values,
    options?: {
      formats?: Formats
      comment?: string
      message?: string
    }
  ): string {
    let message = options?.message
    if (!isString(id)) {
      values = id.values || values
      if ("message" in id) {
        message = id.message
      }
      id = id.id
    }

    const messageForId = this.messages[id]
    const messageMissing = messageForId === undefined

    // replace missing messages with custom message for debugging
    const missing = this._missing
    if (missing && messageMissing) {
      return isFunction(missing) ? missing(this._locale, id) : missing
    }

    if (messageMissing) {
      this.emit("missing", { id, locale: this._locale })
    }

    let translation = messageForId || message || id

    if (process.env.NODE_ENV !== "production") {
      translation = isString(translation)
        ? compileMessage(translation)
        : translation
    }

    // hack for parsing unicode values inside a string to get parsed in react native environments
    if (isString(translation) && UNICODE_REGEX.test(translation))
      return JSON.parse(`"${translation}"`) as string
    if (isString(translation)) return translation

    return interpolate(
      translation,
      this._locale,
      this._locales
    )(values, options?.formats)
  }

  date(value: string | Date, format?: Intl.DateTimeFormatOptions): string {
    return date(this._locales || this._locale, value, format)
  }

  number(value: number, format?: Intl.NumberFormatOptions): string {
    return number(this._locales || this._locale, value, format)
  }

  private _loadLocaleData(locale: Locale, localeData: LocaleData) {
    const maybeLocaleData = this._localeData[locale]
    if (!maybeLocaleData) {
      this._localeData[locale] = localeData
    } else {
      Object.assign(maybeLocaleData, localeData)
    }
  }

  private _load(locale: Locale, messages: Messages) {
    const maybeMessages = this._messages[locale]
    if (!maybeMessages) {
      this._messages[locale] = messages
    } else {
      Object.assign(maybeMessages, messages)
    }
  }
}

function setupI18n(params: setupI18nProps = {}): I18n {
  return new I18n(params)
}

export { setupI18n }
