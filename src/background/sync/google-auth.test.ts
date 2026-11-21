import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { CloudError } from "../../core/cloud/provider";
import {
  createGoogleAuth,
  GOOGLE_TOKEN_KEY,
  type Identity,
} from "./google-auth";
import { GOOGLE_DRIVE_SCOPE } from "./google-clients";

const WEB_CLIENT = "web-client.apps.googleusercontent.com";
const REDIRECT = "https://dgabnakfehpeammboohlkafhhdegbffe.chromiumapp.org/";
const NOW = Date.parse("2026-11-21T10:00:00Z");

beforeEach(() => fakeBrowser.reset());

async function failure(promise: Promise<unknown>): Promise<CloudError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CloudError);
    return error as CloudError;
  }
  throw new Error("did not fail");
}

/** The answer Google's implicit flow redirects to, the token in the fragment. */
const granted = (request: URL, token: string, expiresIn = 3599) =>
  `${REDIRECT}#${new URLSearchParams({
    state: request.searchParams.get("state")!,
    access_token: token,
    token_type: "Bearer",
    expires_in: String(expiresIn),
    scope: GOOGLE_DRIVE_SCOPE,
  })}`;

const refusedWith = (request: URL, error: string) =>
  `${REDIRECT}#error=${error}&state=${request.searchParams.get("state")}`;

/** `launchWebAuthFlow` answered by `answer`; every request is kept. */
function flowIdentity(
  answer: (request: URL, interactive: boolean) => string | Error,
) {
  const requests: { url: URL; interactive: boolean }[] = [];
  const identity: Identity = {
    launchWebAuthFlow: vi.fn(async ({ url, interactive }) => {
      const request = new URL(url);
      requests.push({ url: request, interactive });
      const back = answer(request, interactive);
      if (back instanceof Error) throw back;
      return back;
    }),
    getRedirectURL: () => REDIRECT,
  };
  return { identity, requests };
}

/**
 * Google as measured in Chrome (docs/notes/cloud-sync.md): a window shows the chooser
 * and signs in the account picked there; without a window, a token only for the
 * `login_hint` of an account signed in to Google, else `interaction_required`.
 */
function google() {
  const signedIn = new Set<string>();
  let pick = "first@example.com";
  let n = 0;
  const flow = flowIdentity((request, interactive) => {
    if (interactive) {
      signedIn.add(pick);
      return granted(request, `ya29.${pick}-${++n}`);
    }
    const hint = request.searchParams.get("login_hint");
    if (hint === null || !signedIn.has(hint))
      return refusedWith(request, "interaction_required");
    return granted(request, `ya29.${hint}-${++n}`);
  });
  return {
    ...flow,
    /** The account the user picks in the next chooser. */
    pick(address: string) {
      pick = address;
    },
    signOut(address: string) {
      signedIn.delete(address);
    },
  };
}

function authOf(
  identity: Identity,
  options: {
    account?: () => Promise<string | undefined>;
    now?: () => number;
  } = {},
) {
  return createGoogleAuth({
    webClientId: WEB_CLIENT,
    account: options.account ?? (async () => undefined),
    identity,
    local: fakeBrowser.storage.local,
    now: options.now ?? (() => NOW),
  });
}

describe("signing in (Connect, Reconnect)", () => {
  it("opens the Web client's implicit flow with the account chooser", async () => {
    const g = google();
    const auth = authOf(g.identity, {
      account: async () => "kept@example.com",
    });
    expect(await auth.token({ interactive: true })).toBe(
      "ya29.first@example.com-1",
    );
    const [request] = g.requests;
    expect(request!.interactive).toBe(true);
    expect(request!.url.origin + request!.url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    // No login_hint: the chooser lets the user pick any account, a stored one too.
    expect(Object.fromEntries(request!.url.searchParams)).toEqual({
      client_id: WEB_CLIENT,
      response_type: "token",
      redirect_uri: REDIRECT,
      scope: GOOGLE_DRIVE_SCOPE,
      state: expect.any(String),
      prompt: "select_account",
    });
    expect(await fakeBrowser.storage.local.get(GOOGLE_TOKEN_KEY)).toEqual({
      [GOOGLE_TOKEN_KEY]: {
        token: "ya29.first@example.com-1",
        expiresAt: NOW + 3_599_000,
      },
    });
  });

  it("always opens a window, so another account can be chosen while a token is kept", async () => {
    const g = google();
    const auth = authOf(g.identity);
    await auth.token({ interactive: true });
    g.pick("second@example.com");
    expect(await auth.token({ interactive: true })).toBe(
      "ya29.second@example.com-2",
    );
    expect(g.requests).toHaveLength(2);
    expect(await auth.token({ interactive: false })).toBe(
      "ya29.second@example.com-2",
    );
    expect(g.requests).toHaveLength(2);
  });
});

describe("renewing without a window", () => {
  it("keeps the token in storage.local until it ends, then renews it with the account as login_hint", async () => {
    let now = NOW;
    const g = google();
    g.pick("chosen@example.com");
    await authOf(g.identity, { now: () => now }).token({ interactive: true });

    // Kept: no window, no request, even after the worker starts again.
    const again = authOf(g.identity, {
      account: async () => "chosen@example.com",
      now: () => now,
    });
    now = NOW + 3_000_000;
    expect(await again.token({ interactive: false })).toBe(
      "ya29.chosen@example.com-1",
    );
    expect(g.requests).toHaveLength(1);

    // Near its end: renewed for the same account.
    now = NOW + 3_550_000;
    expect(await again.token({ interactive: false })).toBe(
      "ya29.chosen@example.com-2",
    );
    expect(g.requests).toHaveLength(2);
    const renewal = g.requests[1]!;
    expect(renewal.interactive).toBe(false);
    expect(renewal.url.searchParams.get("prompt")).toBe("none");
    expect(renewal.url.searchParams.get("login_hint")).toBe(
      "chosen@example.com",
    );
  });

  it("asks again for a refused token instead of handing it out", async () => {
    const g = google();
    const auth = authOf(g.identity, {
      account: async () => "first@example.com",
    });
    const first = await auth.token({ interactive: true });
    expect(await auth.token({ interactive: false, refused: first })).toBe(
      "ya29.first@example.com-2",
    );
    expect(g.requests).toHaveLength(2);
  });

  it("without a known address tries prompt=none alone and fails as unauthorized (interaction_required)", async () => {
    const g = google();
    const auth = authOf(g.identity);
    await auth.token({ interactive: true });
    const first = await auth.token({ interactive: false });
    const error = await failure(
      auth.token({ interactive: false, refused: first }),
    );
    expect(error.kind).toBe("unauthorized");
    expect(error.message).toContain("interaction_required");
    const renewal = g.requests[1]!;
    expect(renewal.url.searchParams.get("prompt")).toBe("none");
    expect(renewal.url.searchParams.has("login_hint")).toBe(false);
    expect(await fakeBrowser.storage.local.get(GOOGLE_TOKEN_KEY)).toEqual({});
  });

  it("fails as unauthorized once the user signed out of Google on the web", async () => {
    const g = google();
    const auth = authOf(g.identity, {
      account: async () => "first@example.com",
    });
    const first = await auth.token({ interactive: true });
    g.signOut("first@example.com");
    expect(
      (await failure(auth.token({ interactive: false, refused: first }))).kind,
    ).toBe("unauthorized");
  });
});

it.each([
  ["the window is closed", () => new Error("The user did not approve access.")],
  ["an error in the query", () => `${REDIRECT}?error=access_denied`],
  ["another request's state", () => `${REDIRECT}#access_token=x&state=other`],
  [
    "no token",
    (request: URL) => `${REDIRECT}#state=${request.searchParams.get("state")}`,
  ],
  [
    "another scope",
    (request: URL) =>
      `${REDIRECT}#access_token=x&scope=openid&state=${request.searchParams.get("state")}`,
  ],
] as const)("fails as unauthorized when %s", async (_, answer) => {
  const { identity } = flowIdentity(answer);
  const auth = authOf(identity);
  expect((await failure(auth.token({ interactive: true }))).kind).toBe(
    "unauthorized",
  );
  expect(await fakeBrowser.storage.local.get(GOOGLE_TOKEN_KEY)).toEqual({});
});

it("forgets the kept token; the next sign-in shows the chooser again", async () => {
  const g = google();
  const auth = authOf(g.identity);
  await auth.token({ interactive: true });
  await auth.forget();
  expect(await fakeBrowser.storage.local.get(GOOGLE_TOKEN_KEY)).toEqual({});
  // Disconnected, the address is gone too: no token without a window.
  expect((await failure(auth.token({ interactive: false }))).kind).toBe(
    "unauthorized",
  );
  g.pick("other@example.com");
  expect(await auth.token({ interactive: true })).toBe(
    "ya29.other@example.com-2",
  );
  expect(g.requests.at(-1)!.url.searchParams.get("prompt")).toBe(
    "select_account",
  );
});
