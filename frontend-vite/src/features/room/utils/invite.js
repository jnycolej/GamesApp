export const inviteShareText = ({ sportKey, url }) =>
  `Join my ${String(sportKey).toUpperCase()} room on Sports Shuffle: ${url}`;

export const buildInviteUrl = ({ origin, sportKey, roomCode, token }) =>
  `${origin}/${sportKey}/join?room=${encodeURIComponent(roomCode)}&token=${encodeURIComponent(token)}`;