import React from "react";
import {useNavigate} from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

const NavBar = () => {
    const navigate = useNavigate();
    
    return (
        <div className="m-2">
            <button className="btn" onClick={() => navigate('/')}>Home</button>
            <button className="btn" onClick={() => navigate('/baseball-home')}>Baseball Game</button>            
        </div>

    )
};

export default NavBar;