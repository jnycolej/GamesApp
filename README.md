Sports Shuffle

A single/multiplayer online sports based card game. Utilizes game rooms, custom game logic, and socket.IO for real-time multiplayer game play.

Link to project: https://gamesapp-0bf773689b09.herokuapp.com

How It's Made:

Tech used: JavaScript, HTML, React, Vite, Tailwind CSS, Socket.IO

Sports Shuffle was built as a real-time, room-based web application with both single-player and multiplayer experiences in mind. The frontend is built with React and Vite for fast development and optimized builds. Tailwind CSS is used to produce a clean, responsive UI.
The game logic is handled through a combination of client-side state management and server-side validation to ensure consistency during multiplayer sessions. Socket.IO powers the real-time communication layer, enabling players to create and join game rooms, synchronize game state, and react instantly to other players’ actions.
Each game room maintains its own isolated state, allowing multiple games to run simultaneously without interference. This includes tracking players, turns, scores, and game phases. The architecture was designed to make it easy to add new game modes or rules in the future without rewriting core logic.
The project emphasized clarity and maintainability, with reusable components for cards, players, and game actions, as well as clear separation between UI concerns and game mechanics.

Optimizations

- Refactored game state updates to minimize unnecessary re-renders in React, improving performance during fast-paced multiplayer interactions.
- Centralized Socket.IO event handling to reduce duplicate logic and improve debuggability.
- Simplified and normalized game state objects to make synchronization between players more predictable.
- Leveraged Vite’s build optimizations for faster load times and smaller bundle sizes.
- Designed the UI with Tailwind utility classes to reduce custom CSS overhead and improve consistency.

Lessons Learned:

This project significantly deepened my understanding of real-time applications and the challenges that come with synchronizing state across multiple users. I learned how small mistakes in state management can quickly compound in multiplayer environments and why defensive programming and validation are critical.
Building Sports Shuffle also reinforced the importance of planning game logic before coding and how designing flexible data structures early makes future feature expansion much easier.
Perhaps most importantly, this project boosted my confidence in tackling complex, interactive applications. Seeing multiple players successfully interact in real time with something I built from scratch was a huge “I actually did this” moment and motivated me to continue pushing deeper into full-stack and real-time development.