import { ConfigError, KalError, ValidationError } from '@kal-ai/core';
import type { EngineErrorPayload } from './types';

export class EngineHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'EngineHttpError';
  }
}

export function formatEngineError(error: unknown): EngineErrorPayload {
  if (error instanceof EngineHttpError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof KalError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof SyntaxError) {
    return {
      code: 'INVALID_JSON',
      message: error.message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Unknown error',
  };
}

export function statusForError(error: unknown): number {
  if (error instanceof EngineHttpError) {
    return error.status;
  }
  if (error instanceof ValidationError || error instanceof ConfigError) {
    return 400;
  }
  if (error instanceof KalError) {
    return 500;
  }
  if (error instanceof SyntaxError) {
    return 400;
  }
  return 500;
}
