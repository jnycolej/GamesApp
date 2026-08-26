import { useCallback, useState } from "react";
import { getSocket, rememberRoom } from "@/shared/socket";
import {
  getReconnectToken,
  setReconnectToken,
  setDisplayName,
  setPlayerId,
} from "@/shared/playerIdentity";
import { createRequestId } from "@/shared/requestId";

import { buildInviteUrl } from "@/features/room/utils/invite";

const normalizeRoomCode = (raw) =>
  String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

export function useRoomActions() {
  const [busy, setBusy] = useState(false);

  const createRoom = useCallback(
    ({ sportKey, name, matchup }) =>
      new Promise((resolve) => {
        if (busy) return resolve({ ok: false, error: "Busy" });
        setBusy(true);

        const displayName = (name || "Player").trim();
        setDisplayName(displayName);

        getSocket().emit(
          "room:create",
          {
            gameType: sportKey,
            requestId: createRequestId(),
            displayName,
            matchup,
          },
          (res) => {
            setBusy(false);

            if (!res?.ok) {
              return resolve({
                ok: false,
                error: res?.error ?? "Failed to create room",
              });
            }

            if (res?.playerId) {
              setPlayerId(res.playerId);
            }

            if (res?.reconnectToken) {
              setReconnectToken(res.reconnectToken);
            }

            const { roomCode, token } = res;

            localStorage.setItem(`inviteToken:${roomCode}`, token);

            const inviteUrl = buildInviteUrl({
              origin: window.location.origin,
              sportKey,
              roomCode,
              token,
            });

            rememberRoom(roomCode, displayName);

            resolve({
              ok: true,
              roomCode,
              token,
              inviteUrl,
              displayName,
            });
          },
        );
      }),
    [busy],
  );

  const joinRoom = useCallback(
    ({ sportKey, name, code, token }) =>
      new Promise((resolve) => {
        if (busy) return resolve({ ok: false, error: "Busy" });

        const cleaned = normalizeRoomCode(code);
        if (!cleaned) return resolve({ ok: false, error: "Enter a room code" });

        setBusy(true);

        const displayName = (name || "Player").trim();
        setDisplayName(displayName);

        getSocket().emit(
          "player:join",
          {
            roomCode: cleaned,
            requestId: createRequestId(),
            displayName,
            token: token ?? null,
          },
          (res) => {
            setBusy(false);

            if (!res?.ok) {
              return resolve({
                ok: false,
                error: res?.error ?? "Join failed",
              });
            }

            if (res?.playerId) {
              setPlayerId(res.playerId);
            }

            if (res?.reconnectToken) {
              setReconnectToken(res.reconnectToken);
            }

            rememberRoom(cleaned, displayName);

            resolve({
              ok: true,
              roomCode: cleaned,
              state: res.state,
              displayName,
            });
          },
        );
      }),
    [busy],
  );

  return { busy, createRoom, joinRoom };
}
