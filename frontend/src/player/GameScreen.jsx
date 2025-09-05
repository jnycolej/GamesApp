import { useEffect, useState } from "react";
import { getSocket } from "../shared/socket";
import { useRoomChannel } from "../shared/useRoomState";

export default function PlayerGame() {
    const { room, myHand, setMyHand } = useRoomChannel();
    const [ opponents, setOpponents ] = useState([]);

    useEffect(() => {
        //If someone refreshes mid-game, fetch their hand
        if (!myHand?.length) {
            getSocket().emit("hand:getMine", {}, (res) => {
                if (res?.ok) setMyHand(res.hand ?? []);
            });
        }
    }, [myHand]);

    //View opponents hand on demand
    const viewOpponents = () => {
        getSocket().emit("hand:getOpponents", {}, (res) => {
            if (!res?.ok) return alert(res.error ?? "Not allowed");
            setOpponents(res.opponents || []);
        });
    };

    return (
        <div style={{ padding: 24 }}>
            <h3>Your hand ({myHand.length})</h3>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"}}>
                {myHand.map((c) => (
                    <div key={c.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 12 }}>
                        <div style={{ fontWeight: 700}}>{c.title}</div>
                        <div style={{ fontSize: 12, opacity: 0.8}}>{c.text}</div>
                    </div>
                ))}
            </div>

            <hr style={{ margin: "24px 0"}} />

            <button onClick={viewOpponents}>View Opponents</button>
            { opponents.length > 0 && (
                <div style={{marginTop: 16}}>
                    {opponents.map((p) => (
                        <div key={p.id} style={{ marginBottom: 12}}>
                            <strong>{p.name}</strong> ({p.hand.length})
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6}}>
                                {p.hand.map((c) => (
                                    <div key={c.id} style={{ border: "1px dashed #aaa", borderRadius: 6, padding: 8 }}>
                                        <div style={{ fontWeight: 600 }}>{c.title}</div>
                                        <div style={{ fontSize: 11 }}>{c.text}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}