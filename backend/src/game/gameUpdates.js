
export function createGameUpdates() {
 const updatesByCode = new Map();
const MAX_UPDATES = 100;

function pushUpdate(code, ev) {
  const at = Date.now();
  const id =
    ev.id ||
    `${code}-${at}-${ev.type}-${ev?.player?.id ?? ""}-${ev?.card?.id ?? ""}`;
  const full = { id, at, roomCode: code, ...ev };
  const arr = updatesByCode.get(code) || [];
  arr.push(full);
  if (arr.length > MAX_UPDATES) arr.shift();
  updatesByCode.set(code, arr);
  return full;
}

function getUpdates(code) {
  return (updatesByCode.get(code) || []).slice(-MAX_UPDATES);
}   

function clear(code) {
    updatesByCode.delete(code);
}

return {
    pushUpdate,
    getUpdates,
    clear,
};
}
