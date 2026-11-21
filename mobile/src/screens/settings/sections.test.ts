import { PHONE_SECTIONS, phoneSection } from "./sections";

describe("the phone's Settings sections", () => {
  it("are the web's, in its order, without App", () => {
    expect(PHONE_SECTIONS.map((s) => s.title)).toEqual(["Account", "Working hours", "Calendar", "Connected apps", "Notifications", "Planning", "Appearance", "Data", "About"]);
  });

  it("reads a section from its address, and takes anything else for the list", () => {
    expect(phoneSection("working-hours")).toBe("working-hours");
    expect(phoneSection(["data"])).toBe("data");
    expect(phoneSection("app")).toBeNull();
    expect(phoneSection("nope")).toBeNull();
    expect(phoneSection(undefined)).toBeNull();
  });
});
