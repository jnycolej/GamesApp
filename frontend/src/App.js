import './assets/App.css';
import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import HomePage from './pages/HomePage';
import BaseballGameMainPage from './pages/BaseballGameMainPage';
import FootballGameMainPage from './pages/FootballGameMainPage';

const router = createBrowserRouter(
  [
    {path: "/", element: <HomePage />},
    {path: "/baseball-home", element: <BaseballGameMainPage />},
    {path: "/football-home", element: <FootballGameMainPage />},
  ]
);

const App = () => {
  return (
    <RouterProvider router={router} />
  );
}

export default App;
