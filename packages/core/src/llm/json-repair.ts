/**
 * JSON repair utility for fixing common LLM output issues
 */

/**
 * JSON repair options
 */
export interface JsonRepairOptions {
  extractFromCodeBlock?: boolean;
  fixCommonErrors?: boolean;
  fixTruncated?: boolean;
}

/**
 * Repair and parse JSON from LLM output
 */
export function repairJson(input: string, options: JsonRepairOptions = {}): any {
  const {
    extractFromCodeBlock = true,
    fixCommonErrors = true,
    fixTruncated = true,
  } = options;

  let text = input.trim();

  // Step 1: Extract from markdown code blocks
  if (extractFromCodeBlock) {
    text = extractFromCodeBlock_(text);
  }

  // Step 2: Try parsing as-is first
  try {
    return JSON.parse(text);
  } catch {
    // Continue with repairs
  }

  if (fixCommonErrors) {
    // Step 3: Remove comments
    text = removeComments(text);

    // Step 4: Fix single quotes to double quotes
    text = fixSingleQuotes(text);

    // Step 5: Fix trailing commas
    text = fixTrailingCommas(text);

    // Step 6: Try parsing after fixes
    try {
      return JSON.parse(text);
    } catch {
      // Continue with truncation fix
    }
  }

  if (fixTruncated) {
    // Step 7: Fix truncated JSON
    text = fixTruncated_(text);

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Failed to repair JSON: ${(e as Error).message}`);
    }
  }

  // If all repairs disabled or failed, throw error
  throw new Error('Failed to parse JSON');
}

/**
 * Extract JSON from markdown code blocks
 */
function extractFromCodeBlock_(text: string): string {
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
  const match = text.match(codeBlockRegex);
  if (match) {
    return match[1]!.trim();
  }
  return text;
}

/**
 * Remove single-line and multi-line comments
 */
function removeComments(text: string): string {
  // Remove single-line comments (but not inside strings)
  let result = '';
  let inString = false;
  let stringChar = '';
  let i = 0;

  while (i < text.length) {
    if (inString) {
      if (text[i] === '\\') {
        result += text[i]! + (text[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (text[i] === stringChar) {
        inString = false;
      }
      result += text[i];
      i++;
    } else {
      if (text[i] === '"' || text[i] === "'") {
        inString = true;
        stringChar = text[i]!;
        result += text[i];
        i++;
      } else if (text[i] === '/' && text[i + 1] === '/') {
        // Skip until end of line
        while (i < text.length && text[i] !== '\n') i++;
      } else if (text[i] === '/' && text[i + 1] === '*') {
        // Skip until */
        i += 2;
        while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
        i += 2;
      } else {
        result += text[i];
        i++;
      }
    }
  }

  return result;
}

/**
 * Fix single quotes to double quotes (outside of double-quoted strings)
 */
function fixSingleQuotes(text: string): string {
  let result = '';
  let inDoubleString = false;
  let i = 0;

  while (i < text.length) {
    if (inDoubleString) {
      if (text[i] === '\\') {
        result += text[i]! + (text[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (text[i] === '"') {
        inDoubleString = false;
      }
      result += text[i];
      i++;
    } else {
      if (text[i] === '"') {
        inDoubleString = true;
        result += text[i];
        i++;
      } else if (text[i] === "'") {
        result += '"';
        i++;
      } else {
        result += text[i];
        i++;
      }
    }
  }

  return result;
}

/**
 * Fix trailing commas in objects and arrays
 */
function fixTrailingCommas(text: string): string {
  // Remove trailing commas before } or ]
  return text.replace(/,\s*([\]}])/g, '$1');
}

/**
 * Fix truncated JSON by closing unclosed brackets
 */
function fixTruncated_(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (inString) {
      if (char === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
    } else if (char === '{') {
      stack.push('}');
    } else if (char === '[') {
      stack.push(']');
    } else if (char === '}' || char === ']') {
      stack.pop();
    }
  }

  // Close any unclosed brackets
  let result = text;
  while (stack.length > 0) {
    result += stack.pop();
  }

  return result;
}
