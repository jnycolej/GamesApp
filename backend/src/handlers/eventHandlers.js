import { ClientEvents } from "../protocol/events.js";

import { ErrorCodes } from "../protocol/errors.js";
import { withRequestId, getRequestId } from "../protocol/requestId.js";
import {
  beginRequest,
  completeRequest,
  abandonRequest,
} from "../protocol/idempotency.js";

export function registerEventHandlers({ socket, eventVoting }) {
  socket.on(ClientEvents.EVENT_PROPOSE, (payload = {}, ack) => {
    const requestId = getRequestId(payload);

    let request = null;

    try {
      const code = socket.data.roomCode;

      const playerId = socket.data.playerId;

      if (!code) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.NOT_IN_ROOM,
          }),
        );
      }

      if (!playerId) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.PLAYER_NOT_FOUND,
          }),
        );
      }

      request = beginRequest({
        scope: playerId,
        eventName: ClientEvents.EVENT_PROPOSE,
        requestId,
      });

      if (request.status === "duplicate") {
        return ack?.(request.response);
      }

      if (request.status === "pending") {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.REQUEST_IN_PROGRESS,
          }),
        );
      }

      const finish = (response) => {
        const finalResponse = withRequestId(requestId, response);

        completeRequest(request.key, finalResponse);

        return ack?.(finalResponse);
      };

      const result = eventVoting.propose({
        code,
        playerId,
        eventKey: payload?.eventKey,
      });

      return finish(result);
    } catch (err) {
      abandonRequest(request?.key);

      console.error("[event:propose] error", err);

      return ack?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.SERVER_ERROR,
        }),
      );
    }
  });

  socket.on(ClientEvents.EVENT_VOTE, (payload = {}, ack) => {
    const requestId = getRequestId(payload);

    let request = null;

    try {
      const code = socket.data.roomCode;

      const playerId = socket.data.playerId;

      if (!code) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.NOT_IN_ROOM,
          }),
        );
      }

      if (!playerId) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.PLAYER_NOT_FOUND,
          }),
        );
      }

      request = beginRequest({
        scope: playerId,
        eventName: ClientEvents.EVENT_VOTE,
        requestId,
      });

      if (request.status === "duplicate") {
        return ack?.(request.response);
      }

      if (request.status === "pending") {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.REQUEST_IN_PROGRESS,
          }),
        );
      }

      const finish = (response) => {
        const finalResponse = withRequestId(requestId, response);

        completeRequest(request.key, finalResponse);

        return ack?.(finalResponse);
      };

      const result = eventVoting.vote({
        code,
        playerId,
        eventId: payload?.id,
        vote: payload?.vote,
      });

      return finish(result);
    } catch (err) {
      abandonRequest(request?.key);

      console.error("[event:vote] error", err);

      return ack?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.SERVER_ERROR,
        }),
      );
    }
  });
}
