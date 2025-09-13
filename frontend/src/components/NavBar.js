import React from "react";
import {useNavigate, Link} from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

const NavBar = () => {
    const navigate = useNavigate();
    
    return (
        <div className="m-2">
            <button className="btn" onClick={() => navigate('/')}>Home</button>
            <Link to="/baseball/mode"><button className="btn" onClick={() => navigate('/baseball-home')}>Baseball Game</button></Link>
            <Link to="/football/mode"><button className="btn" onClick={() => navigate('/football-home')}>Football Game</button></Link>            
        </div>

    )
};

export default NavBar;