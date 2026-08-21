import { Server } from "socket.io";

export function createSocketServer({
    httpServer,
    corsOptions,
}) {

    return new Server(httpServer, {
        cors: corsOptions,
        path: "/socket.io",

        pingInterval: 25_000,
        pingTimeout: 90_000,

        connectionStateRecovery: {
            //allows clients to recover missed packets for up to 30 minutes
            maxDisconnectionDuration: 60 * 60 * 1000,
        }
    })
}