// The Logbook's filter sheet: each tap applies at once through the web's own filter rule, and a second tap on the
// chosen row takes that filter off again.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { LogbookFilters } from "@/app/(app)/logbook/logbook-filters";
import { localDate } from "@/core/time";
import { LogbookFilterSheet } from "./logbook-filter-sheet";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const OPTIONS = { projects: [{ id: "p1", name: "Acme launch" }], areas: [{ id: "a1", name: "Work" }], tags: [{ name: "calls" }] };
const show = async (filters: LogbookFilters = {}, options = OPTIONS) => {
  const onChange = jest.fn();
  const onClose = jest.fn();
  await render(<LogbookFilterSheet open filters={filters} onChange={onChange} options={options} today={localDate("2026-11-21")} onClose={onClose} />);
  return { onChange, onClose };
};

describe("<LogbookFilterSheet>", () => {
  it("offers Done or Dropped, the date presets, and the projects, areas and tags the Logbook holds", async () => {
    await show();
    expect(screen.getByRole("header", { name: "Filter" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "All" }).props.accessibilityState).toMatchObject({ checked: true });
    for (const label of ["Today", "Yesterday", "Last 7 days", "Last 30 days", "#Acme launch", "Work", "@calls"]) expect(screen.getByRole("button", { name: label })).toBeTruthy();
  });

  it("a tap applies the filter at once", async () => {
    const { onChange } = await show();
    await fireEvent.press(screen.getByRole("radio", { name: "Dropped" }));
    expect(onChange).toHaveBeenLastCalledWith({ show: "dropped" });
    await fireEvent.press(screen.getByRole("button", { name: "Last 7 days" }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-11-15", to: "2026-11-21" });
    await fireEvent.press(screen.getByRole("button", { name: "#Acme launch" }));
    expect(onChange).toHaveBeenLastCalledWith({ project: "p1" });
    await fireEvent.press(screen.getByRole("button", { name: "Work" }));
    expect(onChange).toHaveBeenLastCalledWith({ area: "a1" });
    await fireEvent.press(screen.getByRole("button", { name: "@calls" }));
    expect(onChange).toHaveBeenLastCalledWith({ tag: "calls" });
  });

  it("the chosen rows are ticked, and a second tap takes the filter off, leaving the others", async () => {
    const { onChange } = await show({ show: "done", project: "p1", tag: "calls", from: "2026-11-21", to: "2026-11-21" });
    expect(screen.getByRole("radio", { name: "Done" }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole("button", { name: "Today" }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole("button", { name: "#Acme launch" }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole("button", { name: "#Acme launch" }));
    expect(onChange).toHaveBeenLastCalledWith({ show: "done", tag: "calls", from: "2026-11-21", to: "2026-11-21" });
    await fireEvent.press(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenLastCalledWith({ show: "done", project: "p1", tag: "calls" });
    await fireEvent.press(screen.getByRole("radio", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith({ project: "p1", tag: "calls", from: "2026-11-21", to: "2026-11-21" });
  });

  it("Clear all takes every filter off and is off when there is none; Done closes", async () => {
    const on = await show({ tag: "calls" });
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));
    expect(on.onChange).toHaveBeenLastCalledWith({});
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(on.onClose).toHaveBeenCalledTimes(1);
  });

  it("with no filter Clear all is off, and a group with nothing to choose from is left out", async () => {
    await show({}, { projects: [], areas: [], tags: [] });
    expect(screen.getByRole("button", { name: "Clear all" }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByRole("header", { name: "PROJECT" })).toBeNull();
    expect(screen.getByRole("header", { name: "DATES" })).toBeTruthy();
  });
});
