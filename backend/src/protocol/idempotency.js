const REQUEST_TTL_MS =
  5 * 60 * 1000;

const requests = new Map();

function cleanupExpired() {
  const now = Date.now();

  for (const [key, entry] of requests) {
    if (entry.expiresAt <= now) {
      requests.delete(key);
    }
  }
}

function makeKey(
  scope,
  eventName,
  requestId,
) {
  return [
    scope,
    eventName,
    requestId,
  ].join(":");
}

export function beginRequest({
  scope,
  eventName,
  requestId,
}) {
  if (!requestId) {
    return {
      status: "new",
      key: null,
    };
  }

  cleanupExpired();

  const key = makeKey(
    scope,
    eventName,
    requestId,
  );

  const existing =
    requests.get(key);

  if (existing?.status === "done") {
    return {
      status: "duplicate",
      response: existing.response,
    };
  }

  if (existing?.status === "pending") {
    return {
      status: "pending",
    };
  }

  requests.set(key, {
    status: "pending",
    expiresAt:
      Date.now() + REQUEST_TTL_MS,
  });

  return {
    status: "new",
    key,
  };
}

export function completeRequest(
  key,
  response,
) {
  if (!key) {
    return;
  }

  requests.set(key, {
    status: "done",
    response,
    expiresAt:
      Date.now() + REQUEST_TTL_MS,
  });
}

export function abandonRequest(key) {
  if (!key) {
    return;
  }

  requests.delete(key);
}
