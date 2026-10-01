// The one seam billing will use (DECISIONS.md Q22: Plan my day is Pro, and
// free accounts get the preview without Approve). Billing does not exist yet,
// so every account may approve; when it does, this is the only line to change,
// and the preview already hides Approve and Approve some when it says no.
export function canApprovePlan(): boolean {
  return true;
}
