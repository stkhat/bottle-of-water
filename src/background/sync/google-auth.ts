/**
 * Google's auth half for cloud sync (architecture "Sync to the user's own cloud
 * storage" → "Parts"): an access token for `drive.appdata`.
 *
 * Where `identity.getAuthToken` exists (Chromium) it is used: the browser keeps and
 * renews the token itself, for the Google account signed in to the browser (the
 * manifest's `oauth2` names the client and scope). Elsewhere, `launchWebAuthFlow` runs
 * Google's implicit flow with the Web client: the token lasts about an hour and is kept
 * in `storage.local`; renewing it without a window (`prompt=none`) may be refused
 * (Chrome answered `interaction_required`), which ends as "Reconnect needed". The
 * account's address would go into `login_hint` to help that renewal, but Langle does not
 * ask for it.
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

/** The parts of `browser.identity` used; `getAuthToken` is missing outside Chromium. */
export interface Identity {
  getAuthToken?(details: {
    interactive: boolean;
    scopes: string[];
  }): Promise<AuthTokenResult>;
  removeCachedAuthToken?(details: { token: string }): Promise<void>;
  clearAllCachedAuthTokens?(): Promise<void>;
  launchWebAuthFlow(details: {
    url: string;
    interactive: boolean;
  }): Promise<string | undefined>;
  getRedirectURL(): string;
}

/** What `getAuthToken` gives: older Chromium gave the token itself. */
type AuthTokenResult =
  { token?: string; grantedScopes?: string[] } | string | undefined;

interface KeptToken {
  token: string;
  expiresAt: number;
}

export interface GoogleAuthOptions {
  /** The Web client for `launchWebAuthFlow`. */
  webClientId: string;
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
  identity = browser.identity,
  local = browser.storage.local,
  now = Date.now,
}: GoogleAuthOptions): CloudAuth {
  /** Chromium: the browser keeps the token. */
  async function browserToken(
    interactive: boolean,
    refused: string | undefined,
  ): Promise<string> {
    if (refused !== undefined)
      await identity
        .removeCachedAuthToken?.({ token: refused })
        .catch(() => undefined);
    let result: AuthTokenResult;
    try {
      result = await identity.getAuthToken!({
        interactive,
        scopes: [GOOGLE_DRIVE_SCOPE],
      });
    } catch (error) {
      throw unauthorized("Google sign-in", error);
    }
    const token = typeof result === "string" ? result : result?.token;
    if (!token) throw unauthorized("Google sign-in gave no token");
    const granted =
      typeof result === "string" ? undefined : result?.grantedScopes;
    if (granted && !granted.includes(GOOGLE_DRIVE_SCOPE))
      throw unauthorized("Google sign-in did not grant Drive's app folder");
    return token;
  }

  /** Elsewhere: Google's implicit flow, the token kept in `storage.local`. */
  async function flowToken(
    interactive: boolean,
    refused: string | undefined,
  ): Promise<string> {
    const kept = (await local.get(GOOGLE_TOKEN_KEY))[GOOGLE_TOKEN_KEY];
    if (isKept(kept)) {
      if (kept.token !== refused && kept.expiresAt - EXPIRY_MARGIN_MS > now())
        return kept.token;
      await local.remove(GOOGLE_TOKEN_KEY);
    }
    const state = crypto.randomUUID();
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", webClientId);
    url.searchParams.set("response_type", "token");
    url.searchParams.set("redirect_uri", identity.getRedirectURL());
    url.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
    url.searchParams.set("state", state);
    if (!interactive) url.searchParams.set("prompt", "none");
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
    token({ interactive, refused }) {
      // Detected by whether it exists, not by the browser's name.
      return identity.getAuthToken
        ? browserToken(interactive, refused)
        : flowToken(interactive, refused);
    },

    // Only this device's copy goes: revoking the grant at Google would sign out the
    // user's other devices too.
    async forget() {
      await local.remove(GOOGLE_TOKEN_KEY);
      await identity.clearAllCachedAuthTokens?.();
    },
  };
}
