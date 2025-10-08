// components/HowToPlay.jsx
import React, { useRef } from "react";
import ReactDOM from "react-dom";

export default function HowToPlay() {
  // Stable, CSS-safe unique ID for the modal
  const modalIdRef = useRef(`howto-${Math.random().toString(36).slice(2, 10)}`);
  const modalId = modalIdRef.current;

  return (
    <>
      {/* Trigger stays in layout exactly where <HowToPlay/> is placed */}
      <button
        type="button"
        className="btn btn-primary"
        data-bs-toggle="modal"
        data-bs-target={`#${modalId}`}
      >
        How To Play
      </button>

      {/* Only the modal is portaled to <body>, so no stacking-context issues */}
      {typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            className="modal fade"
            id={modalId}
            tabIndex={-1}
            aria-labelledby={`${modalId}-label`}
            aria-hidden="true"
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h1 className="modal-title fs-5" id={`${modalId}-label`}>
                    How to Play
                  </h1>
                  <button
                    type="button"
                    className="btn-close"
                    data-bs-dismiss="modal"
                    aria-label="Close"
                  />
                </div>
                <div className="modal-body">
                  <ol className="mb-0">
                    <li>The host starts the game and cards are dealt.</li>
                    <li>Tap cards that match what happens in the live game.</li>
                    <li>Each tap adds/subtracts points per the card.</li>
                    <li>
                      <strong>Win:</strong> Multiplayer = highest points; Single
                      player = just enjoy the game.
                    </li>
                  </ol>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    data-bs-dismiss="modal"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
