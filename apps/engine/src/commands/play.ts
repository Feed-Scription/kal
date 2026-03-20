import { ConfigManager } from '@kal-ai/core';
import { defineCommand } from 'citty';
import { runTui } from '../tui/tui';
import { t, type TuiLocale } from '../tui/i18n';
import { EngineHttpError } from '../errors';
import { setExitCode } from '../cli-context';
import { ensureRuntime, projectPathArg } from './_shared';

function resolveLocale(langArg?: string): TuiLocale {
  if (langArg === 'en' || langArg === 'zh-CN') return langArg;
  try {
    const config = new ConfigManager().loadConfig();
    const lang = config.preferences?.language;
    if (lang === 'en' || lang === 'zh-CN') return lang;
  } catch {
    // config not available — fall through to default
  }
  return 'en';
}

export default defineCommand({
  meta: {
    name: 'play',
    description: 'Run the interactive TUI player',
  },
  args: {
    projectPath: projectPathArg,
    lang: { type: 'string', description: 'UI language (en, zh-CN)', required: false },
  },
  async run({ args }) {
    const locale = resolveLocale(args.lang);
    const { runtime } = await ensureRuntime(args.projectPath);
    if (!runtime.hasSession()) {
      throw new EngineHttpError(t(locale, 'play.noSession'), 400, 'NO_SESSION');
    }
    await runTui({ runtime, locale });
    setExitCode(0);
  },
});
