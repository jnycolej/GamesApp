const SENSITIVE_KEYS = new Set([
  "reconnectToken",
  "token",
  "hostKey",
  "key",
  "authorization",
  "password",
]);

function sanitizeLogData(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeLogData);
  }

  if (value && typeof value === "object") {
    const clean = {};

    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) {
        clean[key] = "[REDACTED]";
        continue;
      }

      clean[key] = sanitizeLogData(item);
    }

    return clean;
  }

  return value;
}

export function logGameTransition(event, data = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event,
      ...sanitizeLogData(data),
    }),
  );
}
