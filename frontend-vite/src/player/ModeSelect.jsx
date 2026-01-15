import { useParams, useNavigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css"; // Import Bootstrap CSS
import "bootstrap/dist/js/bootstrap.bundle.min.js"; // Import Bootstrap JS (optional)

//component imports
import NavBar from "../components/NavBar";
import HowToPlay from "../components/HowToPlay";

//Background imports
import footballBackground from "../assets/football-background.png";
import baseballBackground from "../assets/baseball-background.png";
import basketballBackground from "../assets/basketballbackground.png";

export default function ModeSelect() {
  const { game } = useParams(); //Chooses which game you are playing
  const nav = useNavigate();

  //Switches background based on type of game
  const backgrounds = {
    baseball: baseballBackground,
    football: footballBackground,
    basketball: basketballBackground,
  };

  const background = backgrounds[game] ?? defaultBackground;

  const backgroundStyle = {
    backgroundImage: `url(${background})`,
    minHeight: "100vh",
    width: "100%",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
    backgroundSize: "cover",
  };

  //Single-player
  const goSingle = () => {
    if (game === "baseball") nav("/baseball-home");
    else if (game === "football") nav("/football-home");
    else nav("/");
  };

  //Multiplayer
  const goMulti = () => nav(`/${game}/join`);

  return (
    <div className="p-5" style={backgroundStyle}>
      <h1 className="display-1 text-light fw-bold text-center">
        Sports Shuffle
      </h1>
      <NavBar />
      <div>
        <h2 className="display-4 text-center fw-bold text-white">
          {game?.toUpperCase()}
        </h2>
        <h3 className="display-4 text-center text-white">Choose Game Mode</h3>
        <div className="p-5 container">
          <div className="d-flex flex-row justify-content-center g-2">
            <div className="flex-col">
              <button className="btn btn-lg btn-success" onClick={goSingle}>
                Single Player
              </button>
            </div>
            <div className="flex-col">
              <button
                className="btn btn-lg btn-warning"
                onClick={goMulti}
                style={{ marginLeft: 12 }}
              >
                Multiplayer
              </button>
            </div>
          </div>
          <div className="d-flex justify-content-center mt-3 p-2">
            <HowToPlay />
          </div>
        </div>
      </div>
    </div>
  );
}
