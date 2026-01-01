import React from "react";
import { useNavigate, Link } from 'react-router-dom';
import HowToPlay from './HowToPlay';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

const NavBar = () => {
    const navigate = useNavigate();

    return (
        <div>
            <a href="/">
                <h1 className="display-1 text-light fw-bold text-center">Sports Shuffle</h1>
            </a>
            <div className="m-2">
                <nav className="navbar navbar-expand-lg">
                    <div className="container-fluid">
                        <a className="navbar-brand graduate-regular display-1 fw-bold text-light" href="/">Sports Shuffle</a>
                        <button className="navbar-toggler text-light" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                            <span className="navbar-toggler-icon"></span>
                        </button>
                        <div className="collapse navbar-collapse" id="navbarSupportedContent">
                            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                                <li className="nav-item">
                                    <Link to="/baseball/mode"><button className="nav-link graduate-regular text-light" onClick={() => navigate('/baseball-home')}>Baseball Game</button></Link>
                                </li>
                                <li className="nav-item"><Link to="/football/mode"><button className="nav-link graduate-regular text-light" onClick={() => navigate('/football/home')}>Football Game</button></Link></li>
                                <li className="nav-item"><HowToPlay /></li>
                            </ul>
                        </div>
                    </div>
                </nav>
            </div>
        </div>


    )
};

export default NavBar;