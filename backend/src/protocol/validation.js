export function normalizeRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function normalizeDisplayName(value, fallback = "Player") {
  return (
    String(value || "")
      .trim()
      .slice(0, 24) || fallback
  );
}

export function normalizeEventKey(value){
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
}
