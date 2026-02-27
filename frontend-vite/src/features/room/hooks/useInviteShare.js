import { inviteShareText } from "../utils/invite";

const isBrowser = typeof window !== "undefined";

function canShare() {
  return isBrowser && typeof navigator !== "undefined" && !!navigator.share;
}

function canClipboard() {
  return (
    isBrowser &&
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  );
}

export const openShare = async ({ sportKey, inviteUrl }) => {
  if (!inviteUrl || !isBrowser) return;

  const text = inviteShareText({ sportKey, url: inviteUrl });

  // Native share (mobile best case)
  if (canShare()) {
    try {
      await navigator.share({
        title: "Join my room",
        text,
        url: inviteUrl,
      });
      return;
    } catch {
      // user cancelled — silently ignore
      return;
    }
  }

  // Clipboard fallback
  if (canClipboard()) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Unable to copy invite link on this device.");
      return;
    }
  }

  // SMS fallback (mostly mobile)
  try {
    window.location.href = `sms:&body=${encodeURIComponent(text)}`;
  } catch {
    alert("Invite copied! Paste it into a message.");
  }
};

export const copyInvite = async ({ sportKey, inviteUrl }) => {
  if (!inviteUrl || !isBrowser) return;

  const text = inviteShareText({ sportKey, url: inviteUrl });

  if (!canClipboard()) {
    alert("Clipboard not supported on this device.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    alert("Invite copied!");
  } catch {
    alert("Failed to copy invite.");
  }
};