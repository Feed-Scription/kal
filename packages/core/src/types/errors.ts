/**
 * Error types
 */

/**
 * Error type classification
 */
export type ErrorType = 'validation' | 'execution' | 'timeout' | 'unknown';

/**
 * Node execution error
 */
export interface NodeExecutionError {
  nodeId: string;
  nodeType: string;
  errorType: ErrorType;
  message: string;
  stack?: string;
  timestamp: number;
}

/**
 * Base error class for KAL engine
 */
export class KalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'KalError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends KalError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Execution error
 */
export class ExecutionError extends KalError {
  constructor(message: string, details?: any) {
    super(message, 'EXECUTION_ERROR', details);
    this.name = 'ExecutionError';
  }
}

/**
 * Configuration error
 */
export class ConfigError extends KalError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIG_ERROR', details);
    this.name = 'ConfigError';
  }
}
