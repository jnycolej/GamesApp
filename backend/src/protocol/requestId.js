export function getRequestId(
    payload,
) {
    const value = typeof payload?.requestId === "string"
        ? payload.requestId.trim()
        : "";
    
    return value || null;
}

export function withRequestId(
    requestId,
    response,
) {
    if (!requestId) {
        return response;
    }

    return {
        ...response,
        requestId,
    };
}