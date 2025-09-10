import { io } from "socket.io-client";
// const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080";

const API_URL = process.env.NODE_ENV === "produvtion"
    ? window.location.origin
    : (process.env.REACT_APP_API_URL || "http://localhost:8080");

let socket;
export function getSocket() {
    // if (!socket) socket = io(API_URL, { transports: ["websocket"], withCredentials: true });
    if (!socket) {
        socket = io(API_URL, {
            withCredentials:true,
        });
    }
    return socket;
}