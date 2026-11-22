// A tapped reminder read as the web reads its own: the reminder's page, a pressed button as `?action=`, the deep link
// by the shared parseDeepLink.
import { phonePage, readResponse, type ResponseLike } from "./response";

jest.mock("expo-notifications", () => ({ DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT" }));

const tap = (navigate: unknown, actionIdentifier = "expo.modules.notifications.actions.DEFAULT", id = "n1"): ResponseLike => ({
  actionIdentifier,
  notification: { request: { identifier: id, content: { data: { navigate, kind: "block_start", task_id: "t1", block_id: "b1" } } } },
});

describe("readResponse", () => {
  it("a plain tap: the link with no action, on the phone's Today", () => {
    expect(readResponse(tap("/today?src=push&kind=block_start&task=t1&block=b1"))).toEqual({
      link: { kind: "block_start", taskId: "t1", blockId: "b1", action: null },
      page: "/",
      key: "n1:expo.modules.notifications.actions.DEFAULT",
    });
  });

  it("a button: its action, as the web's worker adds it", () => {
    expect(readResponse(tap("/today?src=push&kind=block_start&task=t1&block=b1", "snooze"))?.link.action).toBe("snooze");
    expect(readResponse(tap("/plan?src=push&kind=morning", "dismiss"))).toMatchObject({ link: { kind: "morning", taskId: null, action: "dismiss" }, page: "/plan" });
    expect(readResponse(tap("/shutdown?src=push&kind=shutdown", "shutdown"))).toMatchObject({ link: { kind: "shutdown", action: "shutdown" }, page: "/shutdown" });
  });

  it("an unknown button is a plain tap; something that is not a reminder is nothing", () => {
    expect(readResponse(tap("/today?src=push&kind=deadline_day&task=t1", "reply"))?.link.action).toBeNull();
    expect(readResponse(tap(undefined))).toBeNull();
    expect(readResponse(tap("/today?task=t1"))).toBeNull();
    expect(readResponse(tap("/today?src=push&kind=lunch"))).toBeNull();
  });
});

describe("phonePage", () => {
  it("names the web's pages the phone's way", () => {
    expect(phonePage("/today?src=push")).toBe("/");
    expect(phonePage("/plan?src=push&kind=morning")).toBe("/plan");
    expect(phonePage("/shutdown")).toBe("/shutdown");
  });
});
