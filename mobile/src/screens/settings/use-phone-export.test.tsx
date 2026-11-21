// The export, wired: gathered as the web gathers it, written as a real file and handed to the share sheet.
import { act, renderHook } from "@testing-library/react-native";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { EXPORT_TABLES, type ExportSnapshot, type Row } from "@/core/export";
import { handOver, usePhoneExport } from "./use-phone-export";

const mockSnapshot = Object.fromEntries(EXPORT_TABLES.map((t) => [t, [] as Row[]])) as ExportSnapshot;
let mockComplete = true;
jest.mock("@/data/powersync", () => ({ useLocalDatabase: () => ({}) }));
jest.mock("@/features/export/gather", () => ({ ...jest.requireActual("@/features/export/gather"), gatherExport: jest.fn(async () => ({ snapshot: mockSnapshot, complete: mockComplete })) }));
jest.mock("@/features/shell/use-local-day", () => ({ useNow: () => ({}), useLocalDay: () => ({ today: {} }) }));
jest.mock("~/api", () => ({ apiFetch: jest.fn() }));
jest.mock("expo-file-system", () => {
  const made: { uri: string; created: unknown; written: unknown }[] = [];
  class File {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
      made.push({ uri: this.uri, created: null, written: null });
    }
    create(options: unknown) {
      made.at(-1)!.created = options;
    }
    async write(content: unknown) {
      made.at(-1)!.written = content;
    }
    static made = made;
  }
  return { File, Paths: { cache: "file:///cache" } };
});
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => undefined) }));

const made = (File as unknown as { made: { uri: string; created: unknown; written: unknown }[] }).made;

beforeEach(() => {
  made.length = 0;
  mockComplete = true;
  jest.mocked(Sharing.shareAsync).mockClear();
});

describe("handOver", () => {
  it("writes the file under its own name in the app's cache, replacing the last one, and opens the share sheet on it", async () => {
    await handOver({ name: "sparehour-tasks-2026-11-22.csv", type: "text/csv", content: "title\n" });
    expect(made).toEqual([{ uri: "file:///cache/sparehour-tasks-2026-11-22.csv", created: { overwrite: true }, written: "title\n" }]);
    expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/sparehour-tasks-2026-11-22.csv", { mimeType: "text/csv", dialogTitle: "sparehour-tasks-2026-11-22.csv" });
  });

  it("writes a zip's bytes as they are", async () => {
    const bytes = Uint8Array.from([80, 75, 5, 6]);
    await handOver({ name: "sparehour-markdown-2026-11-22.zip", type: "application/zip", content: bytes });
    expect(made[0].written).toBe(bytes);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/\.zip$/), expect.objectContaining({ mimeType: "application/zip" }));
  });
});

describe("usePhoneExport", () => {
  it("hands over each format as its own file, and names what was prepared", async () => {
    const hand = jest.fn(async () => undefined);
    const { result } = await renderHook(() => usePhoneExport(hand));
    await act(() => result.current.exportData("markdown"));
    expect(hand).toHaveBeenCalledWith(expect.objectContaining({ name: expect.stringMatching(/^sparehour-markdown-\d{4}-\d\d-\d\d\.zip$/), type: "application/zip", content: expect.any(Uint8Array) }));
    expect(result.current.lastFile).toMatch(/\.zip$/);
    await act(() => result.current.exportData("json"));
    expect(hand).toHaveBeenLastCalledWith(expect.objectContaining({ type: "application/json", content: expect.any(String) }));
    expect(result.current).toMatchObject({ busy: null, error: null });
  });

  it("still hands over what the phone has when finished tasks could not be fetched, and says so", async () => {
    mockComplete = false;
    const { result } = await renderHook(() => usePhoneExport(jest.fn(async () => undefined)));
    await act(() => result.current.exportData("json"));
    expect(result.current.lastFile).toMatch(/\.json$/);
    expect(result.current.error).toMatch(/without finished tasks/);
  });

  it("says so when the file could not be written or shared, and claims nothing was prepared", async () => {
    const { result } = await renderHook(() => usePhoneExport(jest.fn(async () => Promise.reject(new Error("no room")))));
    await act(() => result.current.exportData("csv"));
    expect(result.current.error).toBe("Couldn’t hand the export to another app. Nothing was lost; try again.");
    expect(result.current.lastFile).toBeNull();
  });
});
