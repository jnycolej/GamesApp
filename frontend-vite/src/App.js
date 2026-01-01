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

import TriviaQuiz from './components/TriviaQuiz';

const router = createBrowserRouter(
  [
    {path: "/", element: <HomePage />},

    {path: "/baseball-home", element: <BaseballGameMainPage />},  //Baseball single player homepage
    {path: "/football-home", element: <FootballGameMainPage />},  //Football single player homepage

    { path: '/:game/mode', element: <ModeSelect />},              //Select between single and multiplayer
    { path: '/:game/join', element: <JoinCreateRoom />},          //Join or Create room for multiplayer page
    { path: '/:game/lobby/:code', element: <GameLobby />},        //Multiplayer game lobby page
    { path: '/:game/game', element: <GameScreen />},              //Multiplayer game screen
    
    { path: '/trivia', element: <TriviaQuiz />}                   // Trivia Quiz (Coming Soon)
  ]
);

const App = () => {
  return (
    <RouterProvider router={router} />
  );
}

export default App;
