export const inviteShareText = ({ sportKey, url }) =>
  `Join my ${String(sportKey).toUpperCase()} room on Sports Shuffle: ${url}\n` +
  `If the link doesn't open, open the app -> join -> enter the room code.`;

export const buildInviteUrl = ({ origin, sportKey, roomCode, token }) =>
  `${origin}/${sportKey}/join?room=${encodeURIComponent(roomCode)}&token=${encodeURIComponent(token)}`;