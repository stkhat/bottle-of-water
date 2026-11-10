import { useRef } from "preact/hooks";
import type { ImportResult } from "../../background/term-store";
import { t } from "../../i18n/t";
import type { send } from "../../messaging/client";
import { backupFileName } from "../format/format";

/** What Export and Import work with; pages pass the browser's, tests pass fakes. */
export interface BackupDeps {
  send: typeof send;
  now(): number;
  /** Hands a file to the user (a download). */
  download(fileName: string, text: string): void;
}

/** The result of the last export or import, as a short line; null while there is none. */
export type BackupNote = { ok: boolean; text: string } | null;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Export (downloads `lingo-backup-YYYY-MM-DD.json`) and Import (a file input →
 * `importJson`) buttons, shared by the settings page and the word list. Each press
 * clears the note first; failures and the import's count come back through `onNote`.
 */
export function BackupButtons(props: {
  deps: BackupDeps;
  /** The buttons' class (each page styles its own `.btn`). */
  class: string;
  onNote(note: BackupNote): void;
  onExported?(): void;
  onImported?(result: ImportResult): void;
}) {
  const { deps } = props;
  const fileInput = useRef<HTMLInputElement>(null);

  async function exportFile() {
    props.onNote(null);
    try {
      const json = await deps.send({ type: "exportJson" });
      deps.download(backupFileName(new Date(deps.now())), json);
      props.onExported?.();
    } catch (error) {
      props.onNote({
        ok: false,
        text: t("backup.exportFailed", { error: errorText(error) }),
      });
    }
  }

  async function importFile(file: File) {
    props.onNote(null);
    try {
      const result = await deps.send({
        type: "importJson",
        json: await file.text(),
      });
      props.onNote({
        ok: true,
        text:
          result.terms === 1
            ? t("backup.imported.one")
            : t("backup.imported", { count: fmt(result.terms) }),
      });
      props.onImported?.(result);
    } catch (error) {
      props.onNote({
        ok: false,
        text: t("backup.importFailed", { error: errorText(error) }),
      });
    }
  }

  return (
    <>
      <button
        class={props.class}
        type="button"
        onClick={() => void exportFile()}
      >
        {t("backup.export")}
      </button>
      <button
        class={props.class}
        type="button"
        onClick={() => fileInput.current?.click()}
      >
        {t("backup.import")}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        aria-label={t("backup.file")}
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void importFile(file);
        }}
      />
    </>
  );
}
