import { useEffect, useRef } from "react";

function makeAudio(src, volume = 1) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = volume;
  return audio;
}

export function useGameSounds() {
  const soundsRef = useRef(null);

  useEffect(() => {
    soundsRef.current = {
      join: makeAudio("/sounds/join.mp3"),
      buttonPress: makeAudio("/sounds/button-press.mp3"),
      cardPlay: makeAudio("/sounds/card-play.mp3", 0.8),
      sacrifice: makeAudio("/sounds/sacrifice.mp3", 0.8),
      reaction: makeAudio("/sounds/button-press.mp3", 0.7),
      startDeal: makeAudio("/sounds/floraphonic-swing-whoosh-in-room-13-234267.mp3", 0.8),
      scoreSmall: makeAudio("/sounds/floraphonic-arcade-ui-1-229498.mp3", 0.7),
      scoreBig: makeAudio("/sounds/floraphonic-arcade-ui-26-229495.mp3", 0.8),
      leaderChange: makeAudio("/sounds/floraphonic-arcade-ui-3-229508.mp3", 0.75),
      quizOpen: makeAudio("/sounds/floraphonic-arcade-ui-18-229517.mp3", 0.7),
      quizAward: makeAudio("/sounds/freesound_crunchpixstudio-purchase-success-384963.mp3", 0.8),
    };
  }, []);

  function replay(audio) {
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch((err) => {
        console.error("sound failed", err);
    });
  }

  return {
    playJoin: () => replay(soundsRef.current?.join),
    playButtonPress: () => replay(soundsRef.current?.buttonPress),
    playCard: () => replay(soundsRef.current?.cardPlay),
    playSacrifice: () => replay(soundsRef.current?.sacrifice),
    playReaction: () => replay(soundsRef.current?.buttonPress),
    playStartDeal: () => replay(soundsRef.current?.startDeal),
    playScoreSmall: () => replay(soundsRef.current?.scoreSmall),
    playScoreBig: () => replay(soundsRef.current?.scoreBig),
    playLeaderChange: () => replay(soundsRef.current?.leaderChange),
    playQuizOpen: () => replay(soundsRef.current?.quizOpen),
    playQuizAward: () => replay(soundsRef.current?.quizAward),
  }
}
