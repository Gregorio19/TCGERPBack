const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type LogLevel = keyof typeof levels;

function log(level: LogLevel, ...args: unknown[]) {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  const minimum = configured && Object.hasOwn(levels, configured)
    ? levels[configured as LogLevel]
    : levels[process.env.NODE_ENV === 'production' ? 'info' : 'debug'];

  if (levels[level] < minimum) return;

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}]`, ...args);
}

export const logger = {
  info: (...args: unknown[]) => log('info', ...args),
  error: (...args: unknown[]) => log('error', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  debug: (...args: unknown[]) => log('debug', ...args),
};
