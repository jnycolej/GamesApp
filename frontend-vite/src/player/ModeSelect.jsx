import { useParams, useNavigate } from "react-router-dom";


//component imports
import NavBar from "../components/NavBar";
import HowToPlay from "../components/HowToPlay";

//Background imports
import footballBackground from "@/assets/images/football-background.png";
import baseballBackground from "@/assets/images/baseball-background.png";
import basketballBackground from "@/assets/images/basketballbackground.png";

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
    // minHeight: "100vh",
    // width: "100%",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
    backgroundSize: "cover",
  };

  //Single-player
  const goSingle = () => nav(`/${game}/play/single`);
  //Multiplayer
  const goMulti = () => nav(`/${game}/join`);

  return (
    <div className="min-h-screen w-screen" style={backgroundStyle}>
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
