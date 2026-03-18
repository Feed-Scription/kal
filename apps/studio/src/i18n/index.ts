import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { restoreCachedLocales } from './loader';

import commonEn from './locales/en/common.json';
import registryEn from './locales/en/registry.json';
import commandsEn from './locales/en/commands.json';
import storeEn from './locales/en/store.json';
import workbenchEn from './locales/en/workbench.json';
import flowEn from './locales/en/flow.json';
import sessionEn from './locales/en/session.json';
import debugEn from './locales/en/debug.json';
import vcsEn from './locales/en/vcs.json';
import configEn from './locales/en/config.json';
import terminalEn from './locales/en/terminal.json';
import previewEn from './locales/en/preview.json';

import commonZh from './locales/zh-CN/common.json';
import registryZh from './locales/zh-CN/registry.json';
import commandsZh from './locales/zh-CN/commands.json';
import storeZh from './locales/zh-CN/store.json';
import workbenchZh from './locales/zh-CN/workbench.json';
import flowZh from './locales/zh-CN/flow.json';
import sessionZh from './locales/zh-CN/session.json';
import debugZh from './locales/zh-CN/debug.json';
import vcsZh from './locales/zh-CN/vcs.json';
import configZh from './locales/zh-CN/config.json';
import terminalZh from './locales/zh-CN/terminal.json';
import previewZh from './locales/zh-CN/preview.json';

const ns = [
  'common', 'registry', 'commands', 'store', 'workbench',
  'flow', 'session', 'debug', 'vcs',
  'config', 'terminal', 'preview',
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEn,
        registry: registryEn,
        commands: commandsEn,
        store: storeEn,
        workbench: workbenchEn,
        flow: flowEn,
        session: sessionEn,
        debug: debugEn,
        vcs: vcsEn,
        config: configEn,
        terminal: terminalEn,
        preview: previewEn,
      },
      'zh-CN': {
        common: commonZh,
        registry: registryZh,
        commands: commandsZh,
        store: storeZh,
        workbench: workbenchZh,
        flow: flowZh,
        session: sessionZh,
        debug: debugZh,
        vcs: vcsZh,
        config: configZh,
        terminal: terminalZh,
        preview: previewZh,
      },
    },
    ns: [...ns],
    defaultNS: 'common',
    lng: undefined, // let detector decide
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'kal.studio.language',
    },
    initImmediate: false, // synchronous init — critical for registry/store
  });

// Restore any community language packs previously imported by the user
restoreCachedLocales();

export default i18n;
