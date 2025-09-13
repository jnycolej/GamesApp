import React, { useState } from "react";
import NavBar from "../components/NavBar";
import jsonData from '../assets/footballDeck.json';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)
// import { useNavigate } from "react-router-dom";
import footballBackground from '../assets/football-background.png';

const FootballGameMainPage = () => {
    const [hand, setHand] = useState([]);
    const [points, setPoints] = useState(0);
    const fBackground = footballBackground;

    const generateCard = () => {
        const randomNum = Math.floor(Math.random() * (jsonData.length - 0) + 0);
        return jsonData[randomNum];
    }

    const backgroundStyle = {
        backgroundImage: `url(${fBackground})`,
        minHeight: '100vh',
        width: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundSize: 'cover',
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

    return (
        <div style={backgroundStyle}>
            <div className="football-background">
                <h1 className="display-1 text-center text-light fw-bold">Sports Shuffle</h1>
                <NavBar />
                <h3 className="display-4 text-center text-light">Points: {points}</h3>
                <div className="gap-3">
                    <button className="btn m-3 btn-danger" onClick={handlePlayBall}>Play ball</button>
                    <button className="btn btn-secondary" onClick={restartGame}>Reset</button>
                </div>

                <div className="container">
                    <div className="row justify-content-center">
                        {hand.map((card, idx) => (
                            <div className="col m-2" key={card.id || `card-${idx}`}>
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