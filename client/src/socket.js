import { io } from 'socket.io-client';

let socket = null;
export const getSocket = () => (socket ||= io({ withCredentials: true }));
export const closeSocket = () => { socket?.disconnect(); socket = null; };
