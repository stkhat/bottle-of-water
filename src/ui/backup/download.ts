/** Downloads `text` as a file through a Blob URL (needs no permission). */
export function download(fileName: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Firefox reads the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
