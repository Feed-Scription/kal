export type BuiltinCommandAction = 'help' | 'state' | 'quit' | null;

export function resolveBuiltinCommand(command: string): BuiltinCommandAction {
  if (command === '/help') {
    return 'help';
  }

  if (command === '/state') {
    return 'state';
  }

  if (command === '/quit' || command === '/exit') {
    return 'quit';
  }

  return null;
}

export function resolveChoiceSubmission(
  inputValue: string,
  options: Array<{ label: string; value: string }>,
  selectedChoiceIndex: number,
): { kind: 'command'; command: Exclude<BuiltinCommandAction, null> } | { kind: 'submit'; value: string } | { kind: 'invalid' } | { kind: 'noop' } {
  const trimmed = inputValue.trim();
  const command = resolveBuiltinCommand(trimmed);
  if (command) {
    return {
      kind: 'command',
      command,
    };
  }

  if (!trimmed) {
    const selected = options[selectedChoiceIndex];
    if (!selected) {
      return { kind: 'noop' };
    }

    return {
      kind: 'submit',
      value: selected.value,
    };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { kind: 'invalid' };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed >= 1 && parsed <= options.length) {
    return {
      kind: 'submit',
      value: options[parsed - 1]!.value,
    };
  }

  return { kind: 'invalid' };
}
