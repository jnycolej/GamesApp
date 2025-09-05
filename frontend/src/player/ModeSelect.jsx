import { useParams, useNavigate } from "react-router-dom";

export default function ModeSelect() {
    const { game } = useParams();       //Chooses which game you are playing
    const nav = useNavigate();

    //Single-player
    const goSingle = () => {
        if (game === 'baseball') nav('/baseball-home');
        else if (game === 'football') nav('/football-home');
        else nav('/');
    };

    //Multiplayer
    const goMulti = () => nav(`/${game}/join`);

    return (
        <div style={{padding: 24}}>
            <h2>{game?.toUpperCase()} - Choose Mode</h2>
            <button onClick={goSingle}>Single Player</button>
            <button onClick={goMulti} style={{ marginLeft: 12}}>Multiplayer</button>
        </div>
    );
}