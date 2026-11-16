import { api } from "./api";
import { signOutChatGpt } from "./assistant/chatgptAuth";

/** Both sign-out paths forget this user's ChatGPT connection in the current tab. */
export async function logoutSession(userId: string | undefined, scope: "current" | "all") {
  if (userId) signOutChatGpt(userId);
  try {
    await (scope === "all" ? api.logoutAll() : api.logout());
  } finally {
    if (userId) signOutChatGpt(userId);
  }
}
