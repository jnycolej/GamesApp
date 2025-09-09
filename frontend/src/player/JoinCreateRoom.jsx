import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket } from "../shared/socket";
import NavBar from '../components/NavBar';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

export default function JoinCreateRoom() {
    const {game} = useParams();
    const nav = useNavigate();
    const [code, setCode ] = useState("");
    const [name, setName] = useState("");
    const [state, setState] = useState(null);

    useEffect(() => {
        const s = getSocket();
        const onUpd = (st) => setState(st);
        s.on("room:updated", onUpd);
        return () => s.off("room:updated", onUpd);
    }, []);

    //Creates a room for the game to take place on base on the type selected
    const createRoom = () => {
        const displayName = name || "Player";
        localStorage.setItem("displayName", displayName);
        getSocket().emit("room:create", {gameType: game, displayName}, (res) => {
            if (!res?.ok) return alert(res?.error ?? "Failed to create room"); //Error thrown if room creation fails
            setState(res.state);
            nav(`/${game}/lobby/${res.roomCode}`);  //Navigate to room for the gameplay
        });
    };

    //Allows player to join a room that has already been created
    const joinRoom = () => {
        const displayName = name || "Player";
        localStorage.setItem("displayName", displayName);
        getSocket().emit("player:join", { roomCode: code.trim().toUpperCase(), displayName }, (res) => {
            if (!res?.ok) return alert(res?.error ?? "Join failed");    //Error thrown if join is failed
            setState(res.state);
            nav(`/${game}/lobby/${code.trim().toUpperCase()}`);
        });
    };

    return (
        <div style={{ padding: 24 }}>
            <NavBar />
            <h2>{game?.toUpperCase()} - Multiplayer</h2>
            <div style={{marginTop: 16}}>
                <input placeholder="YOUR NAME" value={name} onChange={(e)=>setName(e.target.value)} />
                <button onClick={createRoom}>Create Room</button>                
            </div>


            <div style={{ marginTop: 16 }}>
                <input placeholder="ROOM CODE" value={code} onChange={(e)=>setCode(e.target.value)} />
                <input placeholder="YOUR NAME" value={name} onChange={(e)=>setName(e.target.value)} />
                <button onClick={joinRoom}>Join</button>
            </div>
            <pre style={{marginTop: 16}}>{state ? JSON.stringify(state, null, 2) : "No room yet."}</pre>
        </div>
    );
}