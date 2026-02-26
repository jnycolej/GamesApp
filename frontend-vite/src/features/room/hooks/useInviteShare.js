import { inviteShareText } from "../utils/invite";

export const openShare = async ({ sportKey, inviteUrl }) => {
  if (!inviteUrl) return;
  const text = inviteShareText({ sportKey, url: inviteUrl });

  if (navigator.share) {
    try {
      await navigator.share({ title: "Join my room", text, url: inviteUrl });
    } catch {}
    return;
  }

  await navigator.clipboard.writeText(text);
  window.location.href = `sms:&body=${encodeURIComponent(text)}`;
};

export const copyInvite = async ({ sportKey, inviteUrl }) => {
  if (!inviteUrl) return;
  const text = inviteShareText({ sportKey, url: inviteUrl });
  await navigator.clipboard.writeText(text);
  alert("Invite copied!");
};