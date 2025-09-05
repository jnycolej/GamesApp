export function createRoomManager() {
    const roomMap = new Map();

    //Generates random for character room code for user input
    const genCode = () => {
        const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
        let s = "";
        for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
        return roomMap.has(s) ? genCode() : s;
    };

    //Creates a room for multiplayer gameplay based on type
    function createRoom({ creatorSocketId, gameType}) {
        const code = genCode();
        roomMap.set(code, {
            code,
            gameType: gameType || 'football',
            phase: "lobby",
            players: new Map(),
            drawPile: [],
            discardPile: [],
            setings: { handSize: 5, openHandsAllowed: true }
        });
        return code;
    }

    function addPlayer(code, { id, displayName }) {
        const r = roomMap.get(code);
        if (!r) return { ok: false, error: "room_not_found"};
        r.players.set(id, { id, name: displayName || "Player", hand: [], connected: true });
        return { ok: true };
    }

    function getPublicState(code) {
        const r = roomMap.get(code);
        if (!r) return null;
        return {
            code: r.code,
            phase: r.phase,
            players: [...r.players.values()].map(p => ({
                id: p.id, name: p.name, handCount: p.hand.length, connected: p.connected
            }))
        };
    }

    function handleDisconnect(code, socketId) {
        const r = roomMap.get(code);
        if (!r) return {};
        const p = r.players.get(socketId);
        if (p) p.connected = false;
        return { roomClosed: false };
    }

    return { createRoom, addPlayer, getPublicState, handleDisconnect };
}