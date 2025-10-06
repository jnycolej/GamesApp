// frontend/src/player/JoinCreateRoom.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getSocket, rememberRoom } from "../shared/socket";
import { getPlayerKey, setDisplayName } from "../shared/playerIdentity";
import NavBar from "../components/NavBar";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import footballBackground from "../assets/football-background.png";
import baseballBackground from "../assets/baseball-background.png";

export default function JoinCreateRoom() {
  const { game } = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [isHost, setIsHost] = useState(false);

  const loc = useLocation();
  const params = new URLSearchParams(loc.search);
  const deepRoom = (params.get("room") || "").toUpperCase();
  const deepToken = params.get("token") || null;

  const background = game === "baseball" ? baseballBackground : footballBackground;
  const backgroundStyle = {
    backgroundImage: `url(${background})`,
    minHeight: "100vh",
    width: "100%",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
    backgroundSize: "cover",
  };

  const shareText = (url) =>
    `Join my ${game?.toUpperCase()} room on Sports Shuffle: ${url}\nIf the link doesn't open, open the app -> join -> enter the room code.`;

  const openShare = async () => {
    if (!inviteUrl) return;
    const text = shareText(inviteUrl);
    if (navigator.share) {
      try { await navigator.share({ title: "Join my room", text, url: inviteUrl}); } catch {}
    } else {
      //fallback
      await navigator.clipboard.writeText(text);
      window.location.href = `sms:&body=${encodeURIComponent(text)}`;
    }
  };

  const copyInvite = async () => {
    if(!inviteUrl) return;
    await navigator.clipboard.writeText(shareText(inviteUrl));
    alert("Invite copied!");
  };

  useEffect(() => {
    const saved = localStorage.getItem("displayName");
    if (saved) setName(saved);

    const s = getSocket();
    const onUpd = (st) => setState(st);
    s.on("room:updated", onUpd);
    return () => s.off("room:updated", onUpd);
  }, []);

  useEffect(() => {
    if (deepRoom) setCode(deepRoom);
  }, [deepRoom /*, deepToken, name */]);

  const createRoom = () => {
    if (busy) return;
    setBusy(true);
    const displayName = (name || "Player").trim();
    setDisplayName(displayName);

    const key = getPlayerKey();
    getSocket().emit("room:create", { gameType: game, displayName, key }, (res) => {
      setBusy(false);
      if (!res?.ok) return alert(res?.error ?? "Failed to create room");
      const { roomCode, token } = res;
      //store token so the lobby can build the invite link for the host
      localStorage.setItem(`inviteToken:${roomCode}`, token);
      
      setIsHost(true);    //creator is host
      // Build invite URL on the client (no server 'origin' needed)
      const origin = window.location.origin;
      setInviteUrl(`${origin}/${game}/join?room=${encodeURIComponent(roomCode)}&token=${encodeURIComponent(token)}`);
      rememberRoom(roomCode, displayName);
      nav(`/${game}/lobby/${roomCode}`);
    });
  };

  const joinRoom = (forcedCode, forcedToken) => {
    if (busy) return;
    const cleaned = (forcedCode || code || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    if (!cleaned) return alert("Enter a room code");
    setBusy(true);

    const displayName = (name || "Player").trim();
    setDisplayName(displayName);

    const key = getPlayerKey();
    console.log("[client] join click", {cleaned, displayName, key, forcedToken, deepToken});

    getSocket().emit(
      "player:join",
      { roomCode: cleaned, displayName, key, token: forcedToken ?? deepToken ?? null },
      (res) => {
        setBusy(false);
        console.log("[client] join result", res);
        if (!res?.ok) return alert(res?.error ?? "Join failed");
        setState(res.state);
        rememberRoom(cleaned, displayName);             // <- save for auto-resume
        nav(`/${game}/lobby/${cleaned}`);
      }
    );
  };

  return (
    <div className="p-5 gap-3" style={backgroundStyle}>
      <NavBar />
      <h2 className="display-1 text-center text-white">{game?.toUpperCase()} - Multiplayer</h2>

      <div className="m-2 input-group" style={{ marginTop: 16 }}>
        <input
          placeholder="YOUR NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-control"
        />
        <button className="btn btn-danger" onClick={createRoom} disabled={busy}>
          {busy ? "Creating..." : "Create Room"}
        </button>
        {isHost && inviteUrl && (
          <div className="alert alert-light mt-3 d-flex gap-2 align-items-center" style={{opacity:0.95}}>
            <span className="me-2">Invite link ready:</span>
            <button className="btn btn-outline-primary btn-sm" onClick={openShare}>Share</button>
            <button className="btn btn-outline-secondary btn-sm" onClick={copyInvite}>Copy</button>
            <a
              className="btn btn-outline-success btn-sm"
              href={`sms:&body=${encodeURIComponent(shareText(inviteUrl))}`}
            >
              Text  
            </a>  
          </div>
        )}
      </div>

      <div className="input-group m-2" style={{ marginTop: 16 }}>
        <input
          placeholder="ROOM CODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="form-control"
          inputMode="text"
          style={{ textTransform: "uppercase" }}
        />
        <input
          placeholder="YOUR NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-control"
        />
        <button className="btn btn-primary" onClick={() => joinRoom()} disabled={busy}>
          {busy ? "Joining..." : "Join"}
        </button>
      </div>

      <pre
        className="display-4 text-dark fw-bold"
        style={{ marginLeft: 10, marginTop: 16, fontSize: "1rem", background: "rgba(255,255,255,0.7)", padding: 12, borderRadius: 8 }}
      >
        {state ? JSON.stringify(state, null, 2) : "No room yet."}
      </pre>
    </div>
  );
}
