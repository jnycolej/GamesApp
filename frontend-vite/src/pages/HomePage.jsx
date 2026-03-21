import React from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";

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
      <div className="mx-4 md:mx-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="w-full">
            <Card className="flex-col bg-transparent border-transparent">
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
          </div>

          <div className="w-full">
            <Card className="flex-col bg-transparent border-transparent">
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
          </div>

          <div className="w-full">
            <Card className="flex-col bg-transparent">
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
    </div>
  );
};

export default HomePage;
