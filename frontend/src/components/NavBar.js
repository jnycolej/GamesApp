import React from "react";
import { useNavigate, Link } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

const NavBar = () => {
    const navigate = useNavigate();

    return (
        <div className="m-2">
            <nav className="navbar navbar-expand-lg">
                <div className="navbar-nav">
                <button className="btn graduate-regular text-light" onClick={() => navigate('/')}>Home</button>
                <Link to="/baseball/mode"><button className="nav-link graduate-regular text-light" onClick={() => navigate('/baseball-home')}>Baseball Game</button></Link>
                <Link to="/football/mode"><button className="nav-link graduate-regular text-light" onClick={() => navigate('/football-home')}>Football Game</button></Link>
                </div>
                <a className="navbar-brand graduate-regular">Sports Shuffle</a>
            </nav>
        </div>

    )
};

export default NavBar;