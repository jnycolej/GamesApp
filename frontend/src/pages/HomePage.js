import React from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import NavBar from '../components/NavBar';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

import baseballGameLogo from '../assets/baseballgamecardlogo.png';
import footballGameLogo from '../assets/football-card-logo.png'
const HomePage = () => {

    // const navigate = useNavigate();

    return (
        <div className="home-background">
            <a onClick={() => Navigate('/')}><h1 className="display-1 fw-bold text-center">Sports Shuffle</h1></a>
            <NavBar />
            <div className="container d-grid row-gap-3">
                <h1 className="display-4 text-center">Games</h1>
            </div>
            <div class="container">
                <div class="mb-3 row justify-content-start gap-4 text-center">
                    <div class="card col home-card mb-4 shadow-lg">
                        <div class="card-header">
                            <h4 class="my-0 font-weight-normal">Baseball Game</h4>
                        </div>
                        <div className="baseball-home-card-logo">
                            <div class="card-body">
                                <Link to="/baseball/mode"><img className="card-img-top" src={baseballGameLogo} alt="Baseball Game"></img></Link>
                            </div>
                        </div>
                    </div>
                    <div class="card col home-card mb-4 shadow-lg">
                        <div class="card-header">
                            <h4 class="my-0 font-weight-normal">Football Game</h4>
                        </div>
                        <div className="football-home-card-logo">
                            <div class="card-body">
                                <Link to="/football/mode"><img className="card-img-top" src={footballGameLogo} alt="Football Game"></img></Link>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
};

export default HomePage;
