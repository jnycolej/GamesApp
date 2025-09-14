// frontend/src/player/JoinCreateRoom.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket, getPlayerKey, rememberRoom } from "../shared/socket";
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

  const background = game === "baseball" ? baseballBackground : footballBackground;
  const backgroundStyle = {
    backgroundImage: `url(${background})`,
    minHeight: "100vh",
    width: "100%",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
    backgroundSize: "cover",
  };

  useEffect(() => {
    const saved = localStorage.getItem("displayName");
    if (saved) setName(saved);

    const s = getSocket();
    const onUpd = (st) => setState(st);
    s.on("room:updated", onUpd);
    return () => s.off("room:updated", onUpd);
  }, []);

  const createRoom = () => {
    if (busy) return;
    setBusy(true);
    const displayName = (name || "Player").trim();
    localStorage.setItem("displayName", displayName);

    const key = getPlayerKey();
    getSocket().emit("room:create", { gameType: game, displayName, key }, (res) => {
      setBusy(false);
      if (!res?.ok) return alert(res?.error ?? "Failed to create room");
      setState(res.state);
      rememberRoom(res.roomCode, displayName);        // <- save for auto-resume
      nav(`/${game}/lobby/${res.roomCode}`);
    });
  };

  const joinRoom = () => {
    if (busy) return;
    const cleaned = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); // allow longer if you like
    if (!cleaned) return alert("Enter a room code");
    setBusy(true);

    const displayName = (name || "Player").trim();
    localStorage.setItem("displayName", displayName);

    const key = getPlayerKey();
    getSocket().emit("player:join", { roomCode: cleaned, displayName, key }, (res) => {
      setBusy(false);
      if (!res?.ok) return alert(res?.error ?? "Join failed");
      setState(res.state);
      rememberRoom(cleaned, displayName);             // <- save for auto-resume
      nav(`/${game}/lobby/${cleaned}`);
    });
  };

  return (
    <div className="p-5 gap-3" style={backgroundStyle}>
      <h1 className="display-1 text-center text-light fw-bold">Sports Shuffle</h1>
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
        <button className="btn btn-primary" onClick={joinRoom} disabled={busy}>
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
