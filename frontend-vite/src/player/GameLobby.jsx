import { useMemo, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket } from "@/shared/socket";
import { getDisplayName, getPlayerKey } from "@/shared/playerIdentity";
import { useRoomChannel } from "../shared/useRoomState";

import { getSport, SPORTS } from "@/config/sports";
import { buildInviteUrl, inviteShareText } from "@/features/room/utils/invite";
import { openShare, copyInvite } from "@/features/room/hooks/useInviteShare";

import { collegeTeams } from "@/assets/data/teams";

import { ArrowRight } from "lucide-react";

import NavBar from "../components/NavBar";
import HowToPlay from "../components/HowToPlay";
import { useGameSounds } from "@/shared/useGameSounds";

const normalizeRoomCode = (raw) =>
  String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

export default function GameLobby() {
  const sounds = useGameSounds();
  const { game, code } = useParams();
  const roomCode = normalizeRoomCode(code);

  const { room, setRoom } = useRoomChannel();
  const nav = useNavigate();
  const socket = getSocket();

  const sport = getSport(game) ?? SPORTS.baseball;

  // Host can invite players using a text or sharing/copying
  const inviteToken =
    (roomCode && localStorage.getItem(`inviteToken:${roomCode}`)) || null;

  const inviteUrl = useMemo(() => {
    if (!inviteToken || !roomCode) return null;
    return buildInviteUrl({
      origin: window.location.origin,
      sportKey: game,
      roomCode,
      token: inviteToken,
    });
  }, [inviteToken, roomCode, game]);

  const backgroundStyle = useMemo(
    () => ({
      backgroundImage: `url(${sport.background})`,
      // minHeight: "100vh",
      // width: "100%",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      backgroundSize: "cover",
    }),
    [sport.background],
  );

  // If phase flips to 'playing', take everyone to the game screen
  useEffect(() => {
    if (room?.phase === "playing") {
      nav(`/${game}/game`);
    }
  }, [room?.phase, game, nav]);

  /**
   * Ensure this client is in the URL room.
   * - We do ONE attempt per roomCode per mount
   * - Try resume first, then join
   * - No focus/visibility handlers (socket.js already handles reconnect resume)
   */
  const ensuredRef = useRef({ roomCode: null, done: false });

  useEffect(() => {
    if (!roomCode) return;

    // Already synced to this room in state
    if (room?.code === roomCode) return;

    // Guard: do not spam resume/join for the same code
    if (ensuredRef.current.roomCode === roomCode && ensuredRef.current.done)
      return;

    ensuredRef.current = { roomCode, done: true };

    const displayName = getDisplayName();
    const key = getPlayerKey();

    socket.emit("player:resume", { roomCode, displayName, key }, (res) => {
      if (res?.ok && res.state) {
        setRoom(res.state);
        return;
      }

      socket.emit("player:join", { roomCode, displayName, key }, (res2) => {
        if (res2?.ok && res2.state) setRoom(res2.state);
      });
    });
  }, [roomCode, room?.code, socket, setRoom]);
  const myKey = getPlayerKey();

  const isHost = useMemo(() => {
    // console.log("room.hostKey:", room?.hostKey);
    // console.log("myKey:", myKey);
    // console.log("equal?", room?.hostKey === myKey);
    // console.log("players:", room?.players);

    if (!room) return false;

    if (room.hostKey && room.hostKey === myKey) return true;

    const me = room.players?.find(
      (p) => p.key === myKey || p.playerKey === myKey,
    );
    if (!me) return false;

    return me.id === room.hostId || me.isHost === true;
  }, [room, myKey]);

  // Your note says allow start even if alone — keep >= 1
  const canStart = useMemo(
    () => !!room && isHost && (room.players?.length ?? 0) >= 1,
    [room, isHost],
  );

  const startAndDeal = () => {
    if (!canStart) return;

    const key = getPlayerKey();
    socket.emit("game:startAndDeal", { key }, (res) => {
      if (!res?.ok) return alert(res?.error ?? "Failed to start");
      sounds.playStartDeal();
      nav(`/${game}/game`);
    });
  };

  return (
    <div className="min-h-screen w-screen" style={backgroundStyle}>
      <div className="p-5">
        <NavBar />
        <h2 className="text-center text-light">
          {" "}
          {room?.matchup?.teams?.length
            ? `${room.matchup.teams[0]} vs. ${room.matchup.teams[1]}`
            : `${game?.toUpperCase()} Game`}
        </h2>
        <h2 className="display-2 text-center text-light">
          ROOM - <strong>{room?.code ?? roomCode ?? ""}</strong>
        </h2>

        <div className="d-flex justify-content-center">
          <HowToPlay />
        </div>

        {inviteUrl && (
          <div
            className="alert alert-light mt-3 d-flex gap-2 align-items-center"
            style={{ opacity: 0.95 }}
          >
            <span className="me-2">Invite link:</span>

            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => openShare({ sportKey: game, inviteUrl })}
            >
              Share
            </button>

            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => copyInvite({ sportKey: game, inviteUrl })}
            >
              Copy
            </button>

            <a
              className="btn btn-outline-success btn-sm"
              href={`sms:&body=${encodeURIComponent(
                inviteShareText({ sportKey: game, url: inviteUrl }),
              )}`}
            >
              Text
            </a>
          </div>
        )}

        {isHost ? (
          <h4 className="fs-3 text-light text-center m3">
            You are the host. Start when ready.
          </h4>
        ) : (
          <h4 className="fs-3 text-light text-center m3">
            Please wait for the host to Start the Game
          </h4>
        )}

        <p className="m-3 text-light text-center fs-2">
          Players: {room?.players?.length ?? 0}
        </p>

        <ul className="gameLobby">
          {room?.players?.map((p) => (
            <li className="text-light text-center fs-4" key={p.id}>
              {p.name} {p.connected === false ? "(reconnecting...)" : ""}
            </li>
          ))}
        </ul>

        {isHost ? (
          <button
            className="text-center font-semibold tracking-wide !text-stone-50 inset-shadow-sm inset-shadow-red-100 text-shadow-stone-800 !text-shadow-sm px-4 !rounded-full !text-2xl bg-red-600"
            onClick={startAndDeal}
            disabled={!canStart}
          >
            Start & Deal
          </button>
        ) : (
          <p> </p>
        )}
      </div>
    </div>
  );
}
