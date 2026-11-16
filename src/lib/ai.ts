import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cached: Anthropic | undefined;
export function anthropic(): Anthropic {
  cached ??= new Anthropic();
  return cached;
}

/** A short message that is safe to show in the UI for any SDK failure. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in your Vercel settings.";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "This API key doesn't have access to the configured model.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "The AI is rate limited right now. Try again in a minute.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return "The AI couldn't process that request. If you sent a photo, try a smaller or clearer one.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the AI service. Check your connection and try again.";
  }
  if (err instanceof Anthropic.APIError) {
    return "The AI service had a problem. Try again in a moment.";
  }
  return "Something went wrong. Try again.";
}

export const AI_NOT_CONFIGURED =
  "AI isn't set up yet. Add ANTHROPIC_API_KEY to the app's environment variables to turn it on.";
