import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {triviaQuestions} from "../assets/data/triviaQuestions";

const TriviaQuiz = ({ onAward }) => {
  const [teamsPlaying, setTeamsPlaying] = useState(["LSU"]);
  // const lsuFootballTrivia = [
  //   {
  //     id: 1,
  //     question:
  //       "What year did LSU win its first recognized national championship in football?",
  //     options: ["1935", "1958", "2003", "2007"],
  //     answer: "1958",
  //     funFact:
  //       "The Tigers went 11-0 under coach Paul Dietzel, capped with a Sugar Bowl win over Clemson.",
  //   },
  //   {
  //     id: 2,
  //     question:
  //       "Which LSU Heisman Trophy winner also led the Tigers to a national title?",
  //     options: [
  //       "Billy Cannon",
  //       "Joe Burrow",
  //       "Leonard Fournette",
  //       "JaMarcus Russell",
  //     ],
  //     answer: "Joe Burrow",
  //     funFact:
  //       "Burrow's 2019 season is considered one of the greatest ever - 60 passing TDs, 15-0 record, and a national championship.",
  //   },
  //   {
  //     id: 3,
  //     question: "LSU's home stadium is nicknamed what?",
  //     options: ["The Swamp", "Death Valley", "The Tiger Den", "The Bayou Bowl"],
  //     answer: "Death Valley",
  //     funFact:
  //       "Officially Tiger Stadium, it's famous for being one of the loudest venues in college football.",
  //   },
  //   {
  //     id: 4,
  //     question:
  //       "What famous play by Billy Cannon on Halloween night 1959 helped him win the Heisman?",
  //     options: [
  //       "Bluegrass Miracle",
  //       "The Earthquake Game",
  //       "The Halloween Run",
  //       "The Goal Line Stand",
  //     ],
  //     answer: "The Halloween Run",
  //     funFact:
  //       "Cannon returned a punt 89 yards against Ole Miss for a 7-3 LSU victory. The call is legendary in Tiger lore.",
  //   },
  //   {
  //     id: 5,
  //     question:
  //       "In 2019, LSU's offense set records under which offensive coordinator?",
  //     options: ["Steve Ensminger", "Joe Brady", "Matt Canada", "Ed Orgeron"],
  //     answer: "Joe Brady",
  //     funFact:
  //       "Brady brought in a pro-style spread offense that revolutionized LSU football. He later joined the NFL.",
  //   },
  //   {
  //     id: 6,
  //     question: "Who holds LSU's single-season passing yards record?",
  //     options: [
  //       "JaMarcus Russell",
  //       "Joe Burrow",
  //       "Jayden Daniels",
  //       "Zach Mettenberger",
  //     ],
  //     answer: "Joe Burrow",
  //     funFact:
  //       "He threw for 5,671 yards in 2019 - breaking both SEC and school records.",
  //   },
  //   {
  //     id: 7,
  //     question:
  //       "LSU's team colors are based on which flower associated with New Orleans?",
  //     options: ["Magnolia", "Camellia", "Iris", "Goldenrod"],
  //     answer: "Goldenrod",
  //     funFact:
  //       "LSU's colors, purple and gold, were inspired by Mardi Gras colors - purple, green, and gold. They dropped the green to honor the school's heritage.",
  //   },
  //   {
  //     id: 8,
  //     question:
  //       "Which SEC rival is LSU's traditional opponent for the final regular-season game?",
  //     options: ["Texas A&M", "Florida", "Arkansas", "Ole Miss"],
  //     answer: "Texas A&M",
  //     funFact:
  //       "The two have renewed a heated rivalry since A&M joined the SEC in 2012.",
  //   },
  //   {
  //     id: 9,
  //     question:
  //       "LSU's live tiger mascot shares what name with a past university president?",
  //     options: ["Mike", "Bill", "Tom", "Pete"],
  //     answer: "Mike",
  //     funFact:
  //       "Every LSU tiger mascot since 1936 has been named Mike, after Dr. Mike Chambers, the athletic trainer who helped bring the first tiger to campus.",
  //   },
  //   {
  //     id: 10,
  //     question:
  //       "Which LSU coach has won national titles at both LSU and Alabama?",
  //     options: ["Nick Saban", "Ed Orgeron", "Les Miles", "Paul Dietzel"],
  //     answer: "Nick Saban",
  //     funFact:
  //       "Saban won at LSU in 2003 and multiple championships at Alabama afterward.",
  //   },
  //   {
  //     id: 11,
  //     question: "What are LSU's official team colors?",
  //     options: [
  //       "Purple and White",
  //       "Purple and Gold",
  //       "Gold and Black",
  //       "Yellow and Blue",
  //     ],
  //     answer: "Purple and Gold",
  //     funFact:
  //       "LSU adopted purple and gold as its colors in 1893, inspired by Mardi Gras colors.",
  //   },
  //   {
  //     id: 12,
  //     question: "What is the name of LSU's mascot?",
  //     options: [
  //       "Tony the Tiger",
  //       "Reggie the Bengal",
  //       "Mike the Tiger",
  //       "Lucky the Lion",
  //     ],
  //     answer: "Mike the Tiger",
  //     funFact:
  //       "Mike the Tiger has been LSU's live mascot since 1936, currently Mike VII.",
  //   },
  //   {
  //     id: 13,
  //     question: "In what city is LSU located?",
  //     options: ["Lafayette", "Baton Rouge", "New Orleans", "Shreveport"],
  //     answer: "Baton Rouge",
  //     funFact:
  //       "LSU's main campus is located along the Mississippi River in Baton Rouge, Louisiana.",
  //   },
  //   {
  //     id: 14,
  //     question: "What is the name of LSU's football stadium?",
  //     options: [
  //       "Death Valley Stadium",
  //       "Tiger Stadium",
  //       "Bayou Field",
  //       "LSU Coliseum",
  //     ],
  //     answer: "Tiger Stadium",
  //     funFact:
  //       "Tiger Stadium is nicknamed 'Death Valley' and seats over 102,000 fans.",
  //   },
  //   {
  //     id: 15,
  //     question: "Who was LSU's Heisman-winning quarterback in 2019?",
  //     options: [
  //       "Zach Mettenberger",
  //       "JaMarcus Russell",
  //       "Joe Burrow",
  //       "Matt Flynn",
  //     ],
  //     answer: "Joe Burrow",
  //     funFact:
  //       "Joe Burrow threw for 60 touchdowns in 2019, leading LSU to a 15-0 season.",
  //   },
  //   {
  //     id: 16,
  //     question: "Who caught the famous 'Bluegrass Miracle' touchdown in 2002?",
  //     options: [
  //       "Devery Henderson",
  //       "Michael Clayton",
  //       "Josh Reed",
  //       "Dwayne Bowe",
  //     ],
  //     answer: "Devery Henderson",
  //     funFact: "The play beat Kentucky on a 74-yard pass as time expired.",
  //   },
  //   {
  //     id: 17,
  //     question: "Who coached LSU to the 2003 National Championship?",
  //     options: ["Les Miles", "Nick Saban", "Ed Orgeron", "Paul Dietzel"],
  //     answer: "Nick Saban",
  //     funFact:
  //       "Nick Saban led LSU to a 13-1 record and BCS title over Oklahoma.",
  //   },
  //   {
  //     id: 18,
  //     question:
  //       "Who was LSU's head coach when they won the 2007 BCS Championship?",
  //     options: ["Nick Saban", "Ed Orgeron", "Les Miles", "Brian Kelly"],
  //     answer: "Les Miles",
  //     funFact:
  //       "Les Miles guided LSU to a 12-2 season and victory over Ohio State in 2007.",
  //   },
  //   {
  //     id: 19,
  //     question:
  //       "Which LSU running back was drafted 4th overall by the Jaguars in 2017?",
  //     options: [
  //       "Clyde Edwards-Helaire",
  //       "Leonard Fournette",
  //       "Jeremy Hill",
  //       "Derrius Guice",
  //     ],
  //     answer: "Leonard Fournette",
  //     funFact: "Fournette ran for over 3,800 yards in his LSU career.",
  //   },
  //   {
  //     id: 20,
  //     question: "What LSU defensive back earned the nickname 'Honey Badger'?",
  //     options: [
  //       "Patrick Peterson",
  //       "Derek Stingley Jr.",
  //       "Greedy Williams",
  //       "Tyrann Mathieu",
  //     ],
  //     answer: "Tyrann Mathieu",
  //     funFact:
  //       "Mathieu earned the nickname for his fearless, aggressive play style.",
  //   },
  //   {
  //     id: 21,
  //     question: "Who was LSU's first Heisman Trophy winner?",
  //     options: ["Joe Burrow", "Billy Cannon", "Tommy Casanova", "Y.A. Tittle"],
  //     answer: "Billy Cannon",
  //     funFact:
  //       "Billy Cannon won the Heisman in 1959 after a legendary punt return vs. Ole Miss.",
  //   },
  //   {
  //     id: 22,
  //     question:
  //       "Against which team did Billy Cannon make his famous Halloween punt return?",
  //     options: ["Alabama", "Auburn", "Ole Miss", "Florida"],
  //     answer: "Ole Miss",
  //     funFact:
  //       "His 89-yard punt return sealed a 7-3 win and became LSU's most iconic play.",
  //   },
  //   {
  //     id: 23,
  //     question:
  //       "Which LSU player was the #1 overall pick in the 2020 NFL Draft?",
  //     options: [
  //       "K'Lavon Chaisson",
  //       "Joe Burrow",
  //       "Ja'Marr Chase",
  //       "Justin Jefferson",
  //     ],
  //     answer: "Joe Burrow",
  //     funFact:
  //       "Burrow was selected by the Cincinnati Bengals after his record-breaking season.",
  //   },
  //   {
  //     id: 24,
  //     question: "What former LSU coach was nicknamed 'The Hat'?",
  //     options: ["Nick Saban", "Les Miles", "Ed Orgeron", "Brian Kelly"],
  //     answer: "Les Miles",
  //     funFact:
  //       "Les Miles was known for his quirky personality and eating grass on the field.",
  //   },
  //   {
  //     id: 25,
  //     question:
  //       "What jersey number is traditionally given to LSU's top defensive back?",
  //     options: ["3", "7", "9", "18"],
  //     answer: "7",
  //     funFact:
  //       "The #7 jersey has been worn by stars like Patrick Peterson and Tyrann Mathieu.",
  //   },
  //   {
  //     id: 26,
  //     question:
  //       "Which LSU coach has won national titles at both LSU and Alabama?",
  //     options: ["Nick Saban", "Ed Orgeron", "Les Miles", "Paul Dietzel"],
  //     answer: "Nick Saban",
  //     funFact:
  //       "Saban won with LSU in 2003 and multiple championships at Alabama afterward.",
  //   },
  //   {
  //     id: 27,
  //     question: "What is LSU's fight song called?",
  //     options: [
  //       "Fight for LSU",
  //       "Geaux Tigers Forever",
  //       "Go Tigers Go",
  //       "Stand Up and Cheer",
  //     ],
  //     answer: "Fight for LSU",
  //     funFact:
  //       "The song was composed in the 1940s and is played after every LSU touchdown.",
  //   },
  //   {
  //     id: 28,
  //     question: "What season did LSU finish 15-0 for the first time?",
  //     options: ["2003", "2007", "2011", "2019"],
  //     answer: "2019",
  //     funFact:
  //       "LSU's 2019 team is considered one of the best in college football history.",
  //   },
  //   {
  //     id: 29,
  //     question: "Which LSU wide receiver won the 2019 Biletnikoff Award?",
  //     options: [
  //       "Ja'Marr Chase",
  //       "Justin Jefferson",
  //       "Terrace Marshall Jr.",
  //       "Odell Beckham Jr.",
  //     ],
  //     answer: "Ja'Marr Chase",
  //     funFact:
  //       "Chase finished with 1,780 receiving yards and 20 touchdowns that season.",
  //   },
  //   {
  //     id: 30,
  //     question: "What is Tiger Stadium's nickname?",
  //     options: ["The Den", "The Swamp", "Death Valley", "The Jungle"],
  //     answer: "Death Valley",
  //     funFact:
  //       "Known for its deafening roar, it's one of the loudest venues in college football.",
  //   },
  //   {
  //     id: 31,
  //     question: "Who was LSU's head coach before Brian Kelly?",
  //     options: ["Les Miles", "Nick Saban", "Ed Orgeron", "Paul Dietzel"],
  //     answer: "Ed Orgeron",
  //     funFact:
  //       "Coach O led LSU to the 2019 National Championship with an undefeated season.",
  //   },
  //   {
  //     id: 32,
  //     question: "What year did LSU football first begin?",
  //     options: ["1889", "1893", "1901", "1910"],
  //     answer: "1893",
  //     funFact:
  //       "LSU played its first game against Tulane, starting a fierce in-state rivalry.",
  //   },
  //   {
  //     id: 33,
  //     question: "Who did LSU defeat to win the 2019 National Championship?",
  //     options: ["Clemson", "Alabama", "Georgia", "Ohio State"],
  //     answer: "Clemson",
  //     funFact:
  //       "LSU beat Clemson 42-25 in New Orleans to cap a perfect 15-0 season.",
  //   },
  //   {
  //     id: 34,
  //     question: "What is LSU's main football rivalry known as?",
  //     options: [
  //       "The Bayou Bowl",
  //       "The Magnolia Bowl",
  //       "The Iron Bowl",
  //       "The Swamp Showdown",
  //     ],
  //     answer: "The Magnolia Bowl",
  //     funFact: "The Magnolia Bowl is played annually between LSU and Ole Miss.",
  //   },
  //   {
  //     id: 35,
  //     question:
  //       "What jersey number is awarded to LSU's team leader and character player?",
  //     options: ["7", "8", "9", "18"],
  //     answer: "18",
  //     funFact:
  //       "The #18 tradition began with QB Matt Mauck, symbolizing leadership and selflessness.",
  //   },
  //   {
  //     id: 36,
  //     question:
  //       "Which LSU player won the 2011 Heisman Trophy finalist spot for defense?",
  //     options: [
  //       "Patrick Peterson",
  //       "Tyrann Mathieu",
  //       "Morris Claiborne",
  //       "Devin White",
  //     ],
  //     answer: "Tyrann Mathieu",
  //     funFact:
  //       "Mathieu became one of the few defensive players in history to finish top three in Heisman voting.",
  //   },
  //   {
  //     id: 37,
  //     question:
  //       "Which LSU quarterback transferred from Arizona State and led the team in 2022?",
  //     options: [
  //       "Jayden Daniels",
  //       "Max Johnson",
  //       "Garrett Nussmeier",
  //       "Danny Etling",
  //     ],
  //     answer: "Jayden Daniels",
  //     funFact:
  //       "Daniels transferred to LSU and quickly became one of the top dual-threat QBs in the SEC.",
  //   },
  //   {
  //     id: 38,
  //     question:
  //       "Who was LSU's opponent in the 2003 BCS National Championship Game?",
  //     options: ["Ohio State", "Oklahoma", "Miami", "Florida State"],
  //     answer: "Oklahoma",
  //     funFact:
  //       "LSU defeated Oklahoma 21-14 to win its first national title since 1958.",
  //   },
  //   {
  //     id: 39,
  //     question:
  //       "What LSU player caught the game-winning touchdown in the 2019 SEC Championship?",
  //     options: [
  //       "Justin Jefferson",
  //       "Ja'Marr Chase",
  //       "Terrace Marshall Jr.",
  //       "Clyde Edwards-Helaire",
  //     ],
  //     answer: "Terrace Marshall Jr.",
  //     funFact:
  //       "Marshall's touchdown helped LSU secure a 37-10 win over Georgia.",
  //   },
  //   {
  //     id: 40,
  //     question:
  //       "Which LSU linebacker was drafted 5th overall by Tampa Bay in 2019?",
  //     options: [
  //       "Kwon Alexander",
  //       "Devin White",
  //       "Deion Jones",
  //       "Patrick Queen",
  //     ],
  //     answer: "Devin White",
  //     funFact:
  //       "White became a Super Bowl champion and defensive captain for the Buccaneers.",
  //   },
  //   {
  //     id: 41,
  //     question: "What year did Tiger Stadium surpass 100,000 seats?",
  //     options: ["2006", "2012", "2014", "2017"],
  //     answer: "2014",
  //     funFact:
  //       "The south end zone expansion brought capacity to over 102,000 fans.",
  //   },
  //   {
  //     id: 42,
  //     question:
  //       "Who was LSU's quarterback during the 2007 National Championship season?",
  //     options: [
  //       "JaMarcus Russell",
  //       "Matt Flynn",
  //       "Jarrett Lee",
  //       "Ryan Perrilloux",
  //     ],
  //     answer: "Matt Flynn",
  //     funFact:
  //       "Flynn led LSU to a 12-2 record and victory over Ohio State in the BCS title game.",
  //   },
  //   {
  //     id: 43,
  //     question: "Which LSU alum is known for the one-handed catch in the NFL?",
  //     options: [
  //       "Justin Jefferson",
  //       "Odell Beckham Jr.",
  //       "Jarvis Landry",
  //       "DJ Chark",
  //     ],
  //     answer: "Odell Beckham Jr.",
  //     funFact:
  //       "Beckham's one-handed grab with the Giants became one of the most famous catches in NFL history.",
  //   },
  //   {
  //     id: 44,
  //     question:
  //       "What LSU player is nicknamed 'Jet' for his speed on the field?",
  //     options: [
  //       "Trindon Holliday",
  //       "Russell Shepard",
  //       "Skyler Green",
  //       "Odell Beckham Jr.",
  //     ],
  //     answer: "Trindon Holliday",
  //     funFact:
  //       `At 5'5", Holliday was one of the fastest players in LSU history, also competing in track.`,
  //   },
  //   {
  //     id: 45,
  //     question: "Which LSU receiver duo became NFL stars for the Bengals?",
  //     options: [
  //       "Odell Beckham Jr. & Jarvis Landry",
  //       "Justin Jefferson & Kayshon Boutte",
  //       "Ja'Marr Chase & Joe Burrow",
  //       "Josh Reed & Dwayne Bowe",
  //     ],
  //     answer: "Ja'Marr Chase & Joe Burrow",
  //     funFact:
  //       "The former LSU duo reunited in Cincinnati and set multiple rookie records.",
  //   },
  //   {
  //     id: 46,
  //     question:
  //       "What team handed LSU its only loss in the 2011 regular season?",
  //     options: ["Alabama", "Arkansas", "Florida", "Georgia"],
  //     answer: "None - LSU went undefeated in the 2011 regular season",
  //     funFact:
  //       "LSU finished 13-0 before losing to Alabama in the BCS Championship.",
  //   },
  //   {
  //     id: 47,
  //     question:
  //       "Which LSU player won the Thorpe Award for the nation's best defensive back in 2011?",
  //     options: [
  //       "Patrick Peterson",
  //       "Tyrann Mathieu",
  //       "Morris Claiborne",
  //       "Derek Stingley Jr.",
  //     ],
  //     answer: "Morris Claiborne",
  //     funFact:
  //       "Claiborne was drafted 6th overall by the Dallas Cowboys in 2012.",
  //   },
  //   {
  //     id: 48,
  //     question: "What LSU quarterback threw for 7 TDs in the 2019 Peach Bowl?",
  //     options: ["Joe Burrow", "Jayden Daniels", "Matt Flynn", "Jarrett Lee"],
  //     answer: "Joe Burrow",
  //     funFact:
  //       "Burrow threw 7 touchdowns in the first half alone against Oklahoma.",
  //   },
  //   {
  //     id: 49,
  //     question:
  //       "Which LSU player became the highest-drafted wide receiver in school history (as of 2021)?",
  //     options: [
  //       "Odell Beckham Jr.",
  //       "Justin Jefferson",
  //       "Ja’Marr Chase",
  //       "Josh Reed",
  //     ],
  //     answer: "Ja'Marr Chase",
  //     funFact:
  //       "Chase was selected 5th overall by the Cincinnati Bengals in 2021.",
  //   },
  //   {
  //     id: 50,
  //     question:
  //       "What was LSU's final record during its 2019 National Championship season?",
  //     options: ["13-1", "14-0", "15-0", "12-2"],
  //     answer: "15-0",
  //     funFact:
  //       "LSU became the first SEC team to finish 15-0, defeating seven top-10 opponents that year.",
  //   },
  //   {
  //     id: 51,
  //     question: "What is LSU's tiger mascot's full name?",
  //     options: [
  //       "Mike the Magnificent",
  //       "Mike the Bengal Tiger",
  //       "Mike the Mighty Tiger",
  //       "Mike the Royal Tiger",
  //     ],
  //     answer: "Mike the Bengal Tiger",
  //     funFact:
  //       "Mike is named after a former LSU athletic trainer, Mike Chambers.",
  //   },
  //   {
  //     id: 52,
  //     question:
  //       "Who was LSU's starting running back in the 2019 National Championship Game?",
  //     options: [
  //       "Leonard Fournette",
  //       "Clyde Edwards-Helaire",
  //       "Jeremy Hill",
  //       "Derrius Guice",
  //     ],
  //     answer: "Clyde Edwards-Helaire",
  //     funFact: "Clyde rushed for over 1,400 yards and 16 touchdowns in 2019.",
  //   },
  //   {
  //     id: 53,
  //     question:
  //       "Which LSU defensive lineman won the 2019 SEC Defensive Player of the Year?",
  //     options: [
  //       "Arden Key",
  //       "K'Lavon Chaisson",
  //       "Grant Delpit",
  //       "Derek Stingley Jr.",
  //     ],
  //     answer: "Grant Delpit",
  //     funFact:
  //       "Delpit also won the Jim Thorpe Award as the nation's top defensive back.",
  //   },
  //   {
  //     id: 54,
  //     question: "What year did LSU last defeat Alabama before 2019?",
  //     options: ["2010", "2011", "2012", "2014"],
  //     answer: "2011",
  //     funFact:
  //       "LSU beat Alabama 9-6 in overtime, known as the 'Game of the Century'.",
  //   },
  //   {
  //     id: 55,
  //     question:
  //       "Who was LSU's head coach during the 1958 National Championship season?",
  //     options: [
  //       "Paul Dietzel",
  //       "Bernie Moore",
  //       "Charlie McClendon",
  //       "Gerry DiNardo",
  //     ],
  //     answer: "Paul Dietzel",
  //     funFact:
  //       "Dietzel's 'Three-Platoon System' revolutionized college football strategy.",
  //   },
  //   {
  //     id: 56,
  //     question:
  //       "Which LSU QB led the Tigers to victory in the 2008 Chick-fil-A Bowl?",
  //     options: [
  //       "Matt Flynn",
  //       "Jarrett Lee",
  //       "Ryan Perrilloux",
  //       "Jordan Jefferson",
  //     ],
  //     answer: "Jordan Jefferson",
  //     funFact:
  //       "Jefferson was just a freshman when he led LSU to a 38–3 win over Georgia Tech.",
  //   },
  //   {
  //     id: 57,
  //     question:
  //       "What LSU running back once broke the single-game rushing record with 284 yards?",
  //     options: [
  //       "Leonard Fournette",
  //       "Jeremy Hill",
  //       "Cecil Collins",
  //       "Derrius Guice",
  //     ],
  //     answer: "Derrius Guice",
  //     funFact:
  //       "Guice broke Fournette's record in 2016, later topping it again the same season.",
  //   },
  //   {
  //     id: 58,
  //     question:
  //       "What's the name of the live tiger habitat located near Tiger Stadium?",
  //     options: ["Mike's Habitat", "Mike's Den", "Tiger Park", "The Roar Zone"],
  //     answer: "Mike's Habitat",
  //     funFact:
  //       "Mike's enclosure is a 15,000-square-foot facility built in 2017 with waterfalls and viewing glass.",
  //   },
  //   {
  //     id: 59,
  //     question: "Which LSU player won the 2019 SEC Championship Game MVP?",
  //     options: [
  //       "Joe Burrow",
  //       "Clyde Edwards-Helaire",
  //       "Ja'Marr Chase",
  //       "Grant Delpit",
  //     ],
  //     answer: "Joe Burrow",
  //     funFact:
  //       "Burrow threw for 349 yards and four touchdowns against Georgia.",
  //   },
  //   {
  //     id: 60,
  //     question:
  //       "Which LSU coach was known for his catchphrase 'Hold That Tiger'?",
  //     options: ["Ed Orgeron", "Les Miles", "Nick Saban", "Paul Dietzel"],
  //     answer: "Ed Orgeron",
  //     funFact:
  //       "Coach O's gravelly Cajun voice made 'Hold That Tiger' a fan favorite after every win.",
  //   },
  // ];
  //Fisher-Yates shuffle for the questions
  
  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const [questions] = useState(() => {
    const picked = shuffleInPlace([...triviaQuestions]).slice(0, 5);

    const arr = [...triviaQuestions];
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
