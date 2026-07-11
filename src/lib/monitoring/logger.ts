type LogContext = Record<string, unknown>;

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 120) return `${value.slice(0, 120)}…`;
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return { type: "ArrayBuffer", byteLength: value.byteLength };
  }

  if (ArrayBuffer.isView(value)) {
    return {
      type: value.constructor.name,
      byteLength: value.byteLength,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as LogContext).slice(0, 12);
    return Object.fromEntries(entries.map(([key, entry]) => [key, sanitizeValue(entry)]));
  }

  return value;
}

function sanitizeContext(context?: LogContext) {
  if (!context) return undefined;
  return sanitizeValue(context) as LogContext;
}

export const logger = {
  info(message: string, context?: LogContext) {
    console.info(`[pdf-compressor] ${message}`, sanitizeContext(context));
  },
  warn(message: string, context?: LogContext) {
    console.warn(`[pdf-compressor] ${message}`, sanitizeContext(context));
  },
  error(message: string, context?: LogContext) {
    console.error(`[pdf-compressor] ${message}`, sanitizeContext(context));
  },
};
