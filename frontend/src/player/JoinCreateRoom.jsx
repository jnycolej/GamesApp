import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket } from "../shared/socket";
import NavBar from '../components/NavBar';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)
import footballBackground from '../assets/football-background.png';
import baseballBackground from '../assets/baseball-background.png';

export default function JoinCreateRoom() {
    const {game} = useParams();
    const nav = useNavigate();
    const [code, setCode ] = useState("");
    const [name, setName] = useState("");
    const [state, setState] = useState(null);

    //Switches background based on type of game
    const background = game === 'baseball' ? baseballBackground : footballBackground;

    const backgroundStyle = {
        backgroundImage: `url(${background})`,
        minHeight: '100vh',
        width: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundSize: 'cover',
    }

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
        <div className="p-5 gap-3" style={backgroundStyle}>
            <h1 className="display-1 text-center text-light fw-bold">Sports Shuffle</h1>
            <NavBar />
            <h2 className="display-1 text-center text-white">{game?.toUpperCase()} - Multiplayer</h2>
            <div className=" m-2 input-group" style={{marginTop: 16}}>
                <input placeholder="YOUR NAME" value={name} onChange={(e)=>setName(e.target.value)} />
                <button className="btn btn-danger" onClick={createRoom}>Create Room</button>                
            </div>
            <div className="input-group m-2" style={{ marginTop: 16 }}>
                <input placeholder="ROOM CODE" value={code} onChange={(e)=>setCode(e.target.value)} />
                <input placeholder="YOUR NAME" value={name} onChange={(e)=>setName(e.target.value)} />
                <button className="btn btn-primary" onClick={joinRoom}>Join</button>
            </div>
            <pre className="display-4 text-dark fw-bold" style={{ marginLeft: 10, marginTop: 16}}>{state ? JSON.stringify(state, null, 2) : "No room yet."}</pre>
        </div>
    );
}