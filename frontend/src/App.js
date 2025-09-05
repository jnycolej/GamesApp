import './assets/App.css';
import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import HomePage from './pages/HomePage';
import BaseballGameMainPage from './pages/BaseballGameMainPage';
import FootballGameMainPage from './pages/FootballGameMainPage';

import ModeSelect from './player/ModeSelect';
import JoinCreateRoom from './player/JoinCreateRoom';
import GameLobby from "./player/GameLobby";
import GameScreen from "./player/GameScreen";

const router = createBrowserRouter(
  [
    {path: "/", element: <HomePage />},

    {path: "/baseball-home", element: <BaseballGameMainPage />},
    {path: "/football-home", element: <FootballGameMainPage />},

    { path: '/:game/mode', element: <ModeSelect />},
    { path: '/:game/join', element: <JoinCreateRoom />},
    { path: '/:game/lobby/:code', element: <GameLobby />},
    { path: '/:game/game', element: <GameScreen />},
  ]
);

const App = () => {
  return (
    <RouterProvider router={router} />
  );
}

export default App;
