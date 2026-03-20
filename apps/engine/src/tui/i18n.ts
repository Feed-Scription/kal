/**
 * Lightweight TUI i18n — static locale dictionary with a simple t() helper.
 *
 * Unlike the studio app (which uses i18next), the CLI only needs two locales
 * and a handful of strings, so a plain object + template interpolation is enough.
 */

export type TuiLocale = 'en' | 'zh-CN';

const messages = {
  en: {
    // help
    'help.help': '/help  Show help',
    'help.state': '/state Show current state',
    'help.quit': '/quit  Quit game',
    // footer
    'footer.ended': 'Session ended',
    'footer.promptHint': 'Type and press Enter. Commands: /help /state /quit',
    'footer.choiceHint': 'Arrow keys to select, Enter to confirm, or type a number. Commands: /help /state /quit',
    // generation
    'gen.hint': 'Generating {indicator}',
    'gen.body': 'Please wait, generating next content {indicator}',
    // input
    'input.yourChoice': 'Your choice',
    'input.yourInput': 'Your input',
    // commands
    'cmd.currentState': 'Current state',
    'cmd.sessionEnd': 'Session ended',
    'cmd.goodbye': 'Goodbye!',
    'cmd.invalidInput': 'Invalid input',
    'cmd.invalidChoiceBody': 'Please choose a number between 1-{max}, or use arrow keys then press Enter',
    // UI
    'ui.waitingInput': 'Awaiting input',
    'ui.inputPrompt': 'Enter command or number: ',
    'ui.enterConfirm': '(Press Enter to confirm current selection)',
    'ui.gameEnded': 'Game over. Press Ctrl+C to return to terminal',
    'ui.gameOver': 'Game over',
    'ui.you': 'You',
    'ui.empty': '(empty)',
    'ui.help': 'Help',
    'ui.error': 'Error',
    'ui.end': 'End',
    'ui.stateChanges': 'State changes',
    // legacy TUI
    'legacy.choosePrompt': 'Choose (enter number)',
    'legacy.invalidChoice': 'Invalid choice, please enter a number between 1-{max}',
    'legacy.enterNumber': 'Please enter a number between 1-{max}',
    // renderer
    'render.stateChanges': '── State changes ──',
    'render.currentState': '── Current state ──',
    'render.welcomeHint': 'Type /help for commands, /quit to exit',
    'render.commands': 'Available commands:',
    'render.cmdQuit': 'Quit game',
    'render.cmdState': 'Show current state',
    'render.cmdHelp': 'Show this help',
    'render.error': 'Error: {message}',
    // play command
    'play.noSession': 'Project is missing session.json, cannot start play mode',
  },
  'zh-CN': {
    'help.help': '/help  查看帮助',
    'help.state': '/state 查看当前状态',
    'help.quit': '/quit  退出游戏',
    'footer.ended': '会话已结束',
    'footer.promptHint': '输入文本后回车，支持 /help /state /quit',
    'footer.choiceHint': '方向键选择并回车，或直接输入数字；支持 /help /state /quit',
    'gen.hint': '正在生成中 {indicator}',
    'gen.body': '请稍候，正在生成下一段内容 {indicator}',
    'input.yourChoice': '你的选择',
    'input.yourInput': '你的输入',
    'cmd.currentState': '当前状态',
    'cmd.sessionEnd': '会话结束',
    'cmd.goodbye': '再见!',
    'cmd.invalidInput': '输入无效',
    'cmd.invalidChoiceBody': '请选择 1-{max} 之间的数字，或使用方向键后按 Enter',
    'ui.waitingInput': '等待输入',
    'ui.inputPrompt': '输入命令或数字: ',
    'ui.enterConfirm': '(回车直接确认当前选项)',
    'ui.gameEnded': '游戏已结束，按 Ctrl+C 返回终端',
    'ui.gameOver': '游戏结束',
    'ui.you': '你',
    'ui.empty': '(空)',
    'ui.help': '帮助',
    'ui.error': '错误',
    'ui.end': '结束',
    'ui.stateChanges': '状态变化',
    'legacy.choosePrompt': '请选择 (输入数字)',
    'legacy.invalidChoice': '无效选择，请输入 1-{max} 之间的数字',
    'legacy.enterNumber': '请输入 1-{max} 之间的数字',
    'render.stateChanges': '── 状态变化 ──',
    'render.currentState': '── 当前状态 ──',
    'render.welcomeHint': '输入 /help 查看命令, /quit 退出',
    'render.commands': '可用命令:',
    'render.cmdQuit': '退出游戏',
    'render.cmdState': '查看当前状态',
    'render.cmdHelp': '显示此帮助',
    'render.error': '错误: {message}',
    'play.noSession': '项目缺少 session.json，无法启动 play 模式',
  },
} as const;

type MessageKey = keyof typeof messages['en'];

/**
 * Look up a translated string by key, with optional `{param}` interpolation.
 * Falls back to English if the key is missing in the requested locale.
 */
export function t(locale: TuiLocale, key: MessageKey, params?: Record<string, string | number>): string {
  const msg: string = messages[locale]?.[key] ?? messages.en[key];
  if (!params) return msg;
  return msg.replace(/\{(\w+)\}/g, (match, k: string) => {
    const val = params[k];
    return val !== undefined ? String(val) : match;
  });
}
