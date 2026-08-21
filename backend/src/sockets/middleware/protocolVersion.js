import { ErrorCodes } from "../../protocol/errors.js";
import { PROTOCOL_VERSION } from "../../protocol/version.js";

export function protocolVersionMiddleware(
    socket,
    next,
) {
    const clientProtocolVersion = socket.handshake.auth?.protocolVersion;

    if(clientProtocolVersion !== PROTOCOL_VERSION) {
        const err = new Error(
            ErrorCodes.INCOMPATIBLE_PROTOCOL_VERSION,
        );

        err.data = {
            code: ErrorCodes.INCOMPATIBLE_PROTOCOL_VERSION,
            clientProtocolVersion,
            serverProtocolVersion: PROTOCOL_VERSION,
        };

        return next(err);
    }

    next();
}