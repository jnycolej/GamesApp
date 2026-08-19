import {
  ClientEvents,
} from "../protocol/events.js";

import {
  ErrorCodes,
} from "../protocol/errors.js";

export function registerEventHandlers({
  socket,
  eventVoting,
}) {
  socket.on(
    ClientEvents.EVENT_PROPOSE,
    (payload = {}, ack) => {
      try {
        const code =
          socket.data.roomCode;

        if (!code) {
          return ack?.({
            ok: false,
            error:
              ErrorCodes.NOT_IN_ROOM,
          });
        }

        const result =
          eventVoting.propose({
            code,
            playerId: socket.id,
            eventKey:
              payload?.eventKey,
          });

        return ack?.(result);
      } catch (err) {
        console.error(
          "[event:propose] error",
          err,
        );

        return ack?.({
          ok: false,
          error:
            ErrorCodes.SERVER_ERROR,
        });
      }
    },
  );

  socket.on(
    ClientEvents.EVENT_VOTE,
    (payload = {}, ack) => {
      try {
        const code =
          socket.data.roomCode;

        if (!code) {
          return ack?.({
            ok: false,
            error:
              ErrorCodes.NOT_IN_ROOM,
          });
        }

        const result =
          eventVoting.vote({
            code,
            playerId: socket.id,
            eventId:
              payload?.id,
            vote:
              payload?.vote,
          });

        return ack?.(result);
      } catch (err) {
        console.error(
          "[event:vote] error",
          err,
        );

        return ack?.({
          ok: false,
          error:
            ErrorCodes.SERVER_ERROR,
        });
      }
    },
  );
}