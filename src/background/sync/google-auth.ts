/**
 * Google's auth half for cloud sync (architecture "Sync to the user's own cloud
 * storage" → "Parts"): an access token for `drive.appdata`.
 *
 * One path in every browser: `launchWebAuthFlow` runs Google's implicit flow with the
 * Web client. Chrome's `getAuthToken` is not used, since it only gives tokens for the
 * Google account signed in to the browser profile, so the user could not choose which
 * Drive to save to. Signing in always shows Google's account chooser
 * (`prompt=select_account`). The token lasts about an hour and is kept in
 * `storage.local`; it is renewed without a window (`prompt=none`) with the connected
 * account's address as `login_hint` (Chrome refused `prompt=none` without one:
 * `interaction_required`). A renewal Google refuses ends as "Reconnect needed".
 */
import { browser } from "wxt/browser";
import { CloudError, type CloudAuth } from "../../core/cloud/provider";
import { errorText } from "../../core/util";
import type { SyncArea } from "./browser-sync-backend";
import { GOOGLE_DRIVE_SCOPE } from "./google-clients";

/** `storage.local`: the token `launchWebAuthFlow` gave, never synced. */
export const GOOGLE_TOKEN_KEY = "googleDriveToken";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
/** A kept token is renewed this long before Google says it ends. */
const EXPIRY_MARGIN_MS = 60_000;

/** The parts of `browser.identity` used. */
export interface Identity {
  launchWebAuthFlow(details: {
    url: string;
    interactive: boolean;
  }): Promise<string | undefined>;
  getRedirectURL(): string;
}

interface KeptToken {
  token: string;
  expiresAt: number;
}

export interface GoogleAuthOptions {
  /** The Web client for `launchWebAuthFlow`. */
  webClientId: string;
  /**
   * The address of the account this device connected with, once known
   * (`cloudAccount`), for the silent renewal's `login_hint`.
   */
  account: () => Promise<string | undefined>;
  /** Defaults to `browser.identity`. */
  identity?: Identity;
  /** Defaults to `browser.storage.local`. */
  local?: Pick<SyncArea, "get" | "set" | "remove">;
  now?: () => number;
}

const unauthorized = (what: string, error?: unknown) =>
  new CloudError(
    "unauthorized",
    error === undefined ? what : `${what}: ${errorText(error)}`,
  );

const isKept = (value: unknown): value is KeptToken =>
  typeof (value as KeptToken | null)?.token === "string" &&
  typeof (value as KeptToken).expiresAt === "number";

export function createGoogleAuth({
  webClientId,
  account,
  identity = browser.identity,
  local = browser.storage.local,
  now = Date.now,
}: GoogleAuthOptions): CloudAuth {
  async function signIn(interactive: boolean): Promise<string> {
    const state = crypto.randomUUID();
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", webClientId);
    url.searchParams.set("response_type", "token");
    url.searchParams.set("redirect_uri", identity.getRedirectURL());
    url.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
    url.searchParams.set("state", state);
    if (interactive) {
      // Always the chooser, so another account can be picked (when reconnecting too).
      url.searchParams.set("prompt", "select_account");
    } else {
      url.searchParams.set("prompt", "none");
      const hint = await account();
      if (hint !== undefined) url.searchParams.set("login_hint", hint);
    }
    let back: string | undefined;
    try {
      back = await identity.launchWebAuthFlow({ url: url.href, interactive });
    } catch (error) {
      throw unauthorized("Google sign-in", error);
    }
    if (!back) throw unauthorized("Google sign-in gave no answer");
    const answer = new URL(back);
    // The implicit flow answers in the fragment; some errors come in the query.
    const params = new URLSearchParams(answer.hash.slice(1) || answer.search);
    const error = params.get("error");
    if (error) throw unauthorized(`Google sign-in: ${error}`);
    if (params.get("state") !== state)
      throw unauthorized("Google sign-in answered another request");
    const token = params.get("access_token");
    if (!token) throw unauthorized("Google sign-in gave no token");
    const scopes = params.get("scope")?.split(" ");
    if (scopes && !scopes.includes(GOOGLE_DRIVE_SCOPE))
      throw unauthorized("Google sign-in did not grant Drive's app folder");
    const seconds = Number(params.get("expires_in"));
    const expiresAt =
      now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000;
    await local.set({ [GOOGLE_TOKEN_KEY]: { token, expiresAt } });
    return token;
  }

  return {
    async token({ interactive, refused }) {
      // A window means the user asked to sign in: never the kept token then.
      if (interactive) return signIn(true);
      const kept = (await local.get(GOOGLE_TOKEN_KEY))[GOOGLE_TOKEN_KEY];
      if (isKept(kept)) {
        if (kept.token !== refused && kept.expiresAt - EXPIRY_MARGIN_MS > now())
          return kept.token;
        await local.remove(GOOGLE_TOKEN_KEY);
      }
      return signIn(false);
    },

    // Only this device's copy goes: revoking the grant at Google would sign out the
    // user's other devices too. The next sign-in shows the chooser anyway.
    async forget() {
      await local.remove(GOOGLE_TOKEN_KEY);
    },
  };
}
