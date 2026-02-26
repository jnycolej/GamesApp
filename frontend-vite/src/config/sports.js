// src/config/sports.js
import footballBackground from "@/assets/images/football-background.png";
import baseballBackground from "@/assets/images/baseball-background.png";

export const SPORTS = {
  baseball: {
    key: "baseball",
    displayName: "Baseball",
    background: baseballBackground,
  },
  football: {
    key: "football",
    displayName: "Football",
    background: footballBackground,
  },
};

export const getSport = (key) => SPORTS[key] ?? null;