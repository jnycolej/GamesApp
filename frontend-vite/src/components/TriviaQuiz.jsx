import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {triviaQuestions} from "../assets/data/triviaQuestions";

const TriviaQuiz = ({matchup, onAward }) => {
  // const [teamsPlaying, setTeamsPlaying] = useState(["LSU"]);
 const teams = matchup;

  //Fisher-Yates shuffle for the question  
  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

const matchupTeams = matchup?.teams ?? [];
const matchupSport = matchup?.sport ?? null;
const matchupLeague = matchup?.league ?? null;

const filteredQuestions = triviaQuestions.filter((q) => {
  // optional tightening:
  if (matchupSport && q.sport !== matchupSport) return false;
  if (matchupLeague && q.league !== matchupLeague) return false;

  // team overlap (any question team appears in matchup teams)
  return (q.teams ?? []).some((t) => matchupTeams.includes(t));
});

if (!matchup) {
  return null; // or a message like: "Select a matchup to play halftime trivia."
}

if (filteredQuestions.length === 0) {
  return (
    <div className="p-3">
      <h2>Half-time Lightning Round</h2>
      <p className="text-muted mb-0">
        No trivia available for this matchup yet.
      </p>
    </div>
  );
}

const questions = useMemo(() => {
  const picked = shuffleInPlace([...filteredQuestions]).slice(0, 5);
  return picked.map((q) => {
    const optionObjs = q.options.map((opt) => ({
      text: opt,
      isCorrect: opt === q.answer,
    }));
    return { ...q, options: shuffleInPlace(optionObjs) };
  });
}, [matchupSport, matchupLeague, matchupTeams.join("|")]);


  const [currentIndex, setCurrentIndex] = useState(0); //Current question in the block
  const [selectedAnswer, setSelectedAnswer] = useState(""); //Stores the pote ntial answer for the question
  const [isAnswered, setIsAnswered] = useState(false); //True if the person has clicked the Guess button and cemented an answer
  const [quizPoints, setQuizPoints] = useState(0); //Points earned during the game
  const [showSummary, setShowSummary] = useState(false);
  

  const awardedRef = useRef(false);

  useEffect(() => {
    if (showSummary && !awardedRef.current) {
      awardedRef.current = true;
      onAward?.(quizPoints);
    }
  }, [showSummary, quizPoints, onAward]);

  if (showSummary) {
    return (
      <div className="p-3">
        <h2>Quiz Complete</h2>
        <p className="lead">
          Score: {quizPoints} / {questions.length}
        </p>
      </div>
    );
  }

  //Tracks the current question and its answer choices
  const q = questions[currentIndex];
  if (!q) return null;

  const groupName = `choice-${q.id}`;

  const handleNext = () => {
    if (currentIndex === questions.length - 1) {
      setShowSummary(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
    setSelectedAnswer("");
    setIsAnswered(false);
  };

  const handleGuess = () => {
    if (!selectedAnswer) return;
    const isRight = q.options.find((o) => o.text === selectedAnswer)?.isCorrect;
    if (isRight) {
      setQuizPoints((p) => p + 1);
      console.log("Your correct!");
    } else {
      console.log("Your answer is wrong");
    }
    setIsAnswered(true);
  };

  return (
    <div>
      <div className="p-3" key={q.id}>
        <h2 className="mb-3">Half-time Lightning Round</h2>

        {/* Current Score */}
        <div className="mb-2">
          <strong>
            Question {currentIndex + 1} / {questions.length}
          </strong>
        </div>

        {/* Question */}
        <p className="fs-2 question" id="question">
          {questions[currentIndex].question}
        </p>

        {/* Question Choices */}
        <fieldset className="mb-3" disabled={isAnswered}>
          <legend className="visually-hidden">Choices</legend>
          {q.options.map((opt, idx) => {
            return (
              <div
                key={idx}
                className={`option ${
                  selectedAnswer === opt.text ? "selected" : ""
                }
                    ${isAnswered ? "disabled" : ""}`}
                onClick={() => !isAnswered && setSelectedAnswer(opt.text)}
              >
                {opt.text}
              </div>
            );
          })}
        </fieldset>

        {!isAnswered ? (
          <button
            className="btn btn-warning"
            type="button"
            disabled={!selectedAnswer}
            onClick={handleGuess}
          >
            Guess
          </button>
        ) : (
          <>
            <div className="mt-3">
              {q.options.find((o) => o.text === selectedAnswer)?.isCorrect ? (
                <div className="alert alert-success mb-2">You're correct!</div>
              ) : (
                <div className="alert alert-danger mb-2">Not quite</div>
              )}
              <small className="text-muted d-block">{q.funFact}</small>
            </div>
            <button
              className="btn btn-success mt-3"
              type="button"
              onClick={handleNext}
            >
              {currentIndex === questions.length - 1
                ? "Finish"
                : "Next Question"}
            </button>
          </>
        )}
      </div>

      {/* <button className={`btn btn-success ${isAnswered === false && 'disabled'}`} onClick={nextQuestion}>Next Question</button> */}
    </div>
  );
};

export default TriviaQuiz;
