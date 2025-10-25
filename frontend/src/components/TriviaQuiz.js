import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const TriviaQuiz = ({ onAward }) => {
  //Points earned during the trivia quiz
  const lsuFootballTrivia = [
    {
      id: 1,
      question:
        "What year did LSU win its first recognized national championship in football?",
      options: ["1935", "1958", "2003", "2007"],
      answer: "1958",
      funFact:
        "The Tigers went 11–0 under coach Paul Dietzel, capped with a Sugar Bowl win over Clemson.",
    },
    {
      id: 2,
      question:
        "Which LSU Heisman Trophy winner also led the Tigers to a national title?",
      options: [
        "Billy Cannon",
        "Joe Burrow",
        "Leonard Fournette",
        "JaMarcus Russell",
      ],
      answer: "Joe Burrow",
      funFact:
        "Burrow’s 2019 season is considered one of the greatest ever — 60 passing TDs, 15–0 record, and a national championship.",
    },
    {
      id: 3,
      question: "LSU’s home stadium is nicknamed what?",
      options: ["The Swamp", "Death Valley", "The Tiger Den", "The Bayou Bowl"],
      answer: "Death Valley",
      funFact:
        "Officially Tiger Stadium, it’s famous for being one of the loudest venues in college football.",
    },
    {
      id: 4,
      question:
        "What famous play by Billy Cannon on Halloween night 1959 helped him win the Heisman?",
      options: [
        "Bluegrass Miracle",
        "The Earthquake Game",
        "The Halloween Run",
        "The Goal Line Stand",
      ],
      answer: "The Halloween Run",
      funFact:
        "Cannon returned a punt 89 yards against Ole Miss for a 7–3 LSU victory. The call is legendary in Tiger lore.",
    },
    {
      id: 5,
      question:
        "In 2019, LSU’s offense set records under which offensive coordinator?",
      options: ["Steve Ensminger", "Joe Brady", "Matt Canada", "Ed Orgeron"],
      answer: "Joe Brady",
      funFact:
        "Brady brought in a pro-style spread offense that revolutionized LSU football. He later joined the NFL.",
    },
    {
      id: 6,
      question: "Who holds LSU’s single-season passing yards record?",
      options: [
        "JaMarcus Russell",
        "Joe Burrow",
        "Jayden Daniels",
        "Zach Mettenberger",
      ],
      answer: "Joe Burrow",
      funFact:
        "He threw for 5,671 yards in 2019 — breaking both SEC and school records.",
    },
    {
      id: 7,
      question:
        "LSU’s team colors are based on which flower associated with New Orleans?",
      options: ["Magnolia", "Camellia", "Iris", "Goldenrod"],
      answer: "Goldenrod",
      funFact:
        "LSU’s colors, purple and gold, were inspired by Mardi Gras colors — purple, green, and gold. They dropped the green to honor the school’s heritage.",
    },
    {
      id: 8,
      question:
        "Which SEC rival is LSU’s traditional opponent for the final regular-season game?",
      options: ["Texas A&M", "Florida", "Arkansas", "Ole Miss"],
      answer: "Texas A&M",
      funFact:
        "The two have renewed a heated rivalry since A&M joined the SEC in 2012.",
    },
    {
      id: 9,
      question:
        "LSU’s live tiger mascot shares what name with a past university president?",
      options: ["Mike", "Bill", "Tom", "Pete"],
      answer: "Mike",
      funFact:
        "Every LSU tiger mascot since 1936 has been named Mike, after Dr. Mike Chambers, the athletic trainer who helped bring the first tiger to campus.",
    },
    {
      id: 10,
      question:
        "Which LSU coach has won national titles at both LSU and Alabama?",
      options: ["Nick Saban", "Ed Orgeron", "Les Miles", "Paul Dietzel"],
      answer: "Nick Saban",
      funFact:
        "Saban won at LSU in 2003 and multiple championships at Alabama afterward.",
    },
  ];
  //Fisher-Yates shuffle for the questions
  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const [questions] = useState(() => {
    const picked = shuffleInPlace([...lsuFootballTrivia]).slice(0, 5);

    const arr = [...lsuFootballTrivia];
    return picked.map((q) => {
      const optionObjs = q.options.map((opt) => ({
        text: opt,
        isCorrect: opt === q.answer,
      }));
      return {
        ...q,
        options: shuffleInPlace(optionObjs),
      };
    });
  });

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
