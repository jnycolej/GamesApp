export function createRequestId() {
    return globalThis.crypto.randomUUID();
}