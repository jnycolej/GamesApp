import React from "react";
import { useNavigate } from "react-router-dom";
import NavBar from '../components/NavBar';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

const HomePage = () => {

const navigate = useNavigate();

    return (
        <div className="home-background">
            <h1 className="display-1 text-center">Home Page</h1>
            <NavBar />
            <div className="container d-grid row-gap-3">
                <h1 className="display-4 text-center">Games</h1>

                <button className="btn btn-lg btn-warning " onClick={() => navigate('/baseball-home')}>Baseball</button>
                <button className="btn btn-lg btn-success" onClick={() => navigate('/football-home')}>Football</button>                
            </div>

        </div>
    )
};

export default HomePage;
