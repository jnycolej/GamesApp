import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

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
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  //Single-player
  const goSingle = () => nav(`/${game}/play/single`);
  //Multiplayer
  const goMulti = () => nav(`/${game}/join`);

  return (
    <div className="min-h-screen w-screen" style={backgroundStyle}>
      <NavBar />
      <div className="px-4 py-6">
        <p className="text-4xl text-center font-semibold text-stone-200">
          {game?.toUpperCase()}
        </p>
        <p className="text-7xl text-center text-stone-200">Choose Game Mode</p>
        <div className="p-5 max-w-4xl mx-auto">
          <div className="flex flex-row sm:flex-row justify-center gap-3 sm:gap-4">
            <div>
              <button
                className="rounded-full bg-yellow-400 font-semibold px-4 py-2 text-base sm:px-5 sm:py-2.5 sm:text-lg md:px-6 md:py-3 md:text-xl"
                onClick={goSingle}
              >
                Single Player
              </button>
            </div>
            <div>
              <button
                className="rounded-full bg-emerald-600 font-semibold px-4 py-2 text-base sm:px-5 sm:py-2.5 sm:text-lg md:px-6 md:py-3 md:text-xl"
                onClick={goMulti}
              >
                Multiplayer
              </button>
            </div>
          </div>
          <div className="flex justify-center p-2">
            <HowToPlay />
          </div>
        </div>
      </div>
    </div>
  );
}
