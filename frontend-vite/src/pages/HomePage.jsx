import React from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";
// import "bootstrap/dist/css/bootstrap.min.css"; // Import Bootstrap CSS
// import "bootstrap/dist/js/bootstrap.bundle.min.js"; // Import Bootstrap JS (optional)
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <div className="mx-5">
        <div className=" row justify-content-start gap-4 text-center">
          <Card className="col bg-transparent border-transparent">
            <CardContent className="card-body">
              <Link to="/baseball/mode">
                <img
                  className="card-img-top"
                  src={baseballGameLogo}
                  alt="Baseball Game"
                ></img>
              </Link>
            </CardContent>
          </Card>

          <Card className="col bg-transparent border-transparent">
            <CardContent className={"card-body"}>
              <Link to="/football/mode">
                <img
                  className="card-img-top"
                  src={footballGameLogo}
                  alt="Football Game"
                ></img>
              </Link>
            </CardContent>
          </Card>

          <Card className="col bg-transparent">
            <CardContent className={"card-body"}>
              <Link to="/basketball/mode">
                <img
                  className="card-img-top"
                  src={basketballGameLogo}
                  alt="Basketball Game"
                ></img>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
