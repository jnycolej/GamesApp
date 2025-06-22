import React from "react";
import { useNavigate } from "react-router-dom";
import NavBar from '../components/NavBar';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

const HomePage = () => {

const navigate = useNavigate();

    return (
        <div>
            <h1 className="display-1">Home Page</h1>
            <NavBar />
            <h1>Games</h1>
            <button className="btn btn-lg btn-warning" onClick={() => navigate('/baseball-home')}>Baseball</button>

            <button className="btn btn-lg btn-success">Football</button>
        </div>
    )
};

export default HomePage;
