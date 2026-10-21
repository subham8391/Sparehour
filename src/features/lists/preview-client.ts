// Asks the server for a link's preview (app/api/lists/preview); the title and picture come back to every device
// through sync. Best effort: offline, or before the link has reached the server, it is simply not there yet, and
// opening the item asks again.
export function requestPreview(itemId: string, url: string): void {
  void fetch("/api/lists/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, url }) }).catch(() => undefined);
}
