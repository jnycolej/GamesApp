import React from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";
import "bootstrap/dist/css/bootstrap.min.css"; // Import Bootstrap CSS
import "bootstrap/dist/js/bootstrap.bundle.min.js"; // Import Bootstrap JS (optional)

import baseballGameLogo from "../assets/baseballgamecardlogo.png";
import footballGameLogo from "../assets/football-card-logo.png";
import basketballGameLogo from "../assets/basketballgamecardlogo.png";

const HomePage = () => {
  // const navigate = useNavigate();

  return (
    <div className="home-background">
      <NavBar />
      <div className="container d-grid row-gap-3">
        <h1 className="display-4 fw-bold text-center">Games</h1>
        <hr />
      </div>
      <div className="container">
        <div className="mb-3 row justify-content-start gap-4 text-center">
          <div className="card col home-card mb-4 shadow-lg">
            <div className="card-header">
              <h4 className="my-0 font-weight-normal">Baseball Game</h4>
            </div>
            <div className="baseball-home-card-logo">
              <div className="card-body">
                <Link to="/baseball/mode">
                  <img
                    className="card-img-top"
                    src={baseballGameLogo}
                    alt="Baseball Game"
                  ></img>
                </Link>
              </div>
            </div>
          </div>
          <div className="card col home-card mb-4 shadow-lg">
            <div className="card-header">
              <h4 className="my-0 font-weight-normal">Football Game</h4>
            </div>
            <div className="football-home-card-logo">
              <div className="card-body">
                <Link to="/football/mode">
                  <img
                    className="card-img-top"
                    src={footballGameLogo}
                    alt="Football Game"
                  ></img>
                </Link>
              </div>
            </div>
          </div>
          <div className="card col home-card mb-4 shadow-lg">
            <div className="card-header">
              <h4 className="my-0 font-weight-normal">Basketball Game</h4>
            </div>
            <div className="basketball-home-card-logo">
              <div className="card-body">
                <Link to="/basketball/mode">
                  <img
                    className="card-img-top"
                    src={basketballGameLogo}
                    alt="Basketball Game"
                  ></img>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
