/**
 * Google sign-in for cloud sync, per build mode: the OAuth clients of Langle's Google
 * Cloud project and the manifest `key` they are tied to (architecture "Sync to the
 * user's own cloud storage" → "Parts", "Extension ids"). Client ids are public (they go
 * into the manifest); no client secret is used. Read by wxt.config.ts for the manifest
 * and by the background for the provider, so plain constants only.
 */

/** The only scope: the app's own hidden folder in the user's Drive. */
export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.appdata";

export interface GoogleClients {
  /**
   * The "Chrome extension" client `identity.getAuthToken` uses (the manifest's
   * `oauth2`). It is tied to one extension id.
   */
  chromeExtension: string;
  /**
   * The "Web application" client `identity.launchWebAuthFlow` uses where
   * `getAuthToken` does not exist. Its redirect URIs name the extension ids
   * (`https://<id>.chromiumapp.org/`; Firefox's is added when Firefox is checked).
   */
  web: string;
}

/** Development and check builds: tied to `DEVELOPMENT_EXTENSION_KEY`'s id. */
export const DEVELOPMENT_GOOGLE_CLIENTS: GoogleClients = {
  chromeExtension:
    "191564468385-nmn8mdj6shonud18lkkhsjm0nvrpi8jm.apps.googleusercontent.com",
  web: "191564468385-i9mvko6iu5qpq1o8pkhtufudvu72nc36.apps.googleusercontent.com",
};

/**
 * Production builds: none until the Chrome Web Store item exists, since its id gets a
 * Chrome-extension client of its own (in the same Cloud project, so it sees the same
 * `appDataFolder`; docs/status.md "Before publishing"). Until then production builds
 * have no cloud provider.
 */
export const PRODUCTION_GOOGLE_CLIENTS: GoogleClients | undefined = undefined;

/**
 * The manifest `key` (a public key, base64 DER) of development and check builds, so
 * their id is always `dgabnakfehpeammboohlkafhhdegbffe`, the id the development
 * Chrome-extension client is registered for. Production builds carry none: the store
 * gives the id.
 */
export const DEVELOPMENT_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt0eGcA0hwTJg8pXZxZ0jR97KLbEnUe+jpLSesnnjqNKJoSt9rwzyk1AZ3Mrgwf3ejEZP1+A8aRvVAT8g4tTAH7k46BM7HFdAeOasNWLfE9VZU18PiSoHNUe27hBbtfLSlmtsqAMLrulZFK4vVUmAl5pqs4A9iVbr3S5ubbgjdxdWxN6pJuIXNcjEUT8FiR1fS1PZAK9jBH+1tfFDhXXp+vmfK1AdHwUNC+Yli0kztdMh2Af02dwTw9B3dcK9I1/+dfHLtgXfKERk5W5V1kBt3dlQmboZQWJNjQSP+aDDoJYn/qdPlb3+76Vjfp1vxOpeAqsk9K4sKcFrxMsv+io5VQIDAQAB";

/** A build mode's clients: production's own, every other mode the development ones. */
export const googleClients = (mode: string): GoogleClients | undefined =>
  mode === "production"
    ? PRODUCTION_GOOGLE_CLIENTS
    : DEVELOPMENT_GOOGLE_CLIENTS;
