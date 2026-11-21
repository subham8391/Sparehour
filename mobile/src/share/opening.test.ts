// Where an address the app is opened with leads: a share, the icon's two shortcuts, and everything else left alone.
import { NOTHING_SHARED, opening } from "./opening";

const none = () => "";

describe("opening", () => {
  it("a share with words opens the Inbox with quick add holding them, as the web's /share does", () => {
    const shared = jest.fn(() => "Read the report // https://example.com/report");
    expect(opening("sparehour://expo-sharing", shared)).toEqual({ to: "/inbox", quickAdd: { text: "Read the report // https://example.com/report" } });
    expect(shared).toHaveBeenCalledTimes(1);
  });

  it("a share that brought nothing opens the page that says so, and asks for no sheet", () => {
    expect(opening("sparehour://expo-sharing", none)).toEqual({ to: NOTHING_SHARED });
    expect(opening("sparehour://expo-sharing/", none)).toEqual({ to: "/share" });
  });

  it("the Add a task shortcut opens Today with quick add open and empty", () => {
    expect(opening("sparehour://today?quickadd=1", none)).toEqual({ to: "/", quickAdd: {} });
    expect(opening("sparehour:///today?src=x&quickadd=1", none)).toEqual({ to: "/", quickAdd: {} });
    expect(opening("/today?quickadd=1", none)).toEqual({ to: "/", quickAdd: {} });
  });

  it("the Today shortcut opens Today and nothing else", () => {
    expect(opening("sparehour://today", none)).toEqual({ to: "/" });
    expect(opening("sparehour://today?quickadd=10", none)).toEqual({ to: "/" });
  });

  it("every other address is the app's own and is left as it came; what was shared is not read for it", () => {
    const shared = jest.fn(none);
    for (const address of ["sparehour:///", "sparehour://", "sparehour://task/abc", "sparehour://inbox", "sparehour://auth/callback?code=1", "/project/p1", "sparehour://todayish", "exp+sparehour://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081"]) {
      expect(opening(address, shared)).toEqual({ to: address });
    }
    expect(shared).not.toHaveBeenCalled();
  });
});
