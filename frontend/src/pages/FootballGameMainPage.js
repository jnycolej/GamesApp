import React, {useState} from "react";
import NavBar from "../components/NavBar";
import jsonData from '../assets/footballDeck.json';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)
// import { useNavigate } from "react-router-dom";

const FootballGameMainPage = () => {
    const [hand, setHand] = useState([]);
    const [points, setPoints] = useState(0);

    const generateCard = () => {
        const randomNum = Math.floor(Math.random() * (jsonData.length - 0) + 0);
        return jsonData[randomNum];
    }

    const generateHand = () => {
        const newHand = [];
        for (let i = 0; i < 5; i++) {
            newHand.push(generateCard());
        }
        return newHand;
    }

    const handlePlayBall = () => {
        setHand(generateHand());
    }

    const handleCardClick = (index, cardPoints) => {
        
        setPoints(prev => prev + cardPoints);
        const newCard = generateCard();

        setHand(prevHand => {
            const updated = [...prevHand];
            updated[index] = newCard;
            return updated;
        });
    };

    const restartGame = () => {
        setPoints(0);
        setHand(generateHand());
    }

    return(
        <div className="containerStyle">
            <div className="football-background">
            <h1>Football Game</h1>
            <NavBar />
            <h2>Create Room</h2>
            <button className="btn btn-success">Create Room</button>
            <h3>Deck | Points: {points}</h3>
            <button className="btn btn-danger" onClick={handlePlayBall}>Play ball</button>
            <button className="btn btn-secondary" onClick={restartGame}>Reset</button>
            <div className="container">
                <div className="row">
                    {hand.map((card, idx) => (
                        <div className="col m-2" key={hand.id}>
                            <button className="card playingCard p-3" onClick={() => handleCardClick(idx, card.points)}>
                                <p className="card-text">{card.description}</p>
                                <p className="card-text">{card.penalty}</p>
                                <p className="card-text">points: {card.points}</p>
                            </button>                  
                        </div>
                    ))}                    
                </div>
                
            </div>                
            </div>

            

        </div>
    )
};

export default FootballGameMainPage;