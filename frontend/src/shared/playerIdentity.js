export function getPlayerKey() {
    let k = localStorage.getItem("playerKey");
    if (!k) {
        const gen =
            (typeof window !== "undefined" &&
                window.crypto &&
                typeof window.crypto.randomUUID === "function" &&
                window.crypto.randomUUID()) ||
                (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toUpperCase();
            localStorage.setItem("playerKey", gen);
            k = gen;
    }
    return k;
}

export function getDisplayName() {
    return localStorage.getItem("displayName") || "Player";
}

export function setDisplayName(name) {
    const safe = (name || "").trim() || "Player";
    localStorage.setItem("displayName", safe);
    return safe;
}