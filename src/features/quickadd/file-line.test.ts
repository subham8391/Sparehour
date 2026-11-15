// A task added "here" (DECISIONS.md, amendment 2026-11-15): a line that names no day takes the day shown, and one
// that names no project takes the page's project; a line that says its own keeps it.
import { describe, expect, it } from "vitest";
import { parse } from "@/core/quickadd";
import { instant, localDate, localTime } from "@/core/time";
import { chooseProject, draftHere, fileHere, fileLine, type Here } from "./file-line";

const ctx = { now: instant("2026-11-16T09:00:00Z"), zone: "UTC", today: localDate("2026-11-16"), eveningStartsAt: localTime("18:00") };
const projects = [
  { id: "p1", name: "Acme" },
  { id: "p2", name: "Website" },
];
const NOWHERE: Here = { day: null, project: null };
const onTuesday: Here = { day: localDate("2026-11-17"), project: null };
const inAcme: Here = { day: null, project: projects[0] };

function filed(text: string, here: Here) {
  const r = parse(text, ctx);
  if (!r.ok) throw new Error(`"${text}" has no name`);
  return fileHere(fileLine(text, r, projects, ctx, chooseProject(r.draft, projects, null, false)), Boolean(r.draft.projectName), here);
}

describe("draftHere", () => {
  it("gives a line with no day the day shown, and leaves a line that names one alone", () => {
    const plain = parse("Buy milk", ctx);
    const dated = parse("Buy milk fri", ctx);
    expect(plain.ok && draftHere(plain.draft, onTuesday).doDate?.toString()).toBe("2026-11-17");
    expect(dated.ok && draftHere(dated.draft, onTuesday).doDate?.toString()).toBe("2026-11-20");
    expect(plain.ok && draftHere(plain.draft, NOWHERE)).toBe(plain.ok && plain.draft);
  });
});

describe("fileHere", () => {
  it("files a plain line on the day shown", () => {
    const f = filed("Buy milk ~15m", onTuesday);
    expect(f.submission.draft).toMatchObject({ title: "Buy milk", estimateMin: 15 });
    expect(f.submission.draft.doDate?.toString()).toBe("2026-11-17");
    expect(f.submission.projectId).toBeNull();
  });

  it("keeps the day the line names, and this evening stays today", () => {
    expect(filed("Buy milk tomorrow", { day: localDate("2026-11-20"), project: null }).submission.draft.doDate?.toString()).toBe("2026-11-17");
    const evening = filed("Call mum evening", onTuesday).submission.draft;
    expect(evening.doDate?.toString()).toBe("2026-11-16");
    expect(evening.evening).toBe(true);
  });

  it("files a plain line in the page's project and says so in the notice's words", () => {
    const f = filed("Write the brief", inAcme);
    expect(f.submission.projectId).toBe("p1");
    expect(f.project).toBe("Acme");
  });

  it("a line that names a project keeps its own, whether it files there or matched nothing", () => {
    expect(filed("Write the brief #Website", inAcme).submission.projectId).toBe("p2");
    // A name no project fits files nowhere and stays in the title (§5.3 rule 7): the page's project is not a second guess.
    const unmatched = filed("Write the brief #Zebra", inAcme);
    expect(unmatched.submission.projectId).toBeNull();
    expect(unmatched.unfiled?.name).toBe("Zebra");
  });

  it("does both at once, and nothing at all where there is no here", () => {
    const both = filed("Write the brief", { day: localDate("2026-11-17"), project: projects[1] });
    expect(both.submission.projectId).toBe("p2");
    expect(both.submission.draft.doDate?.toString()).toBe("2026-11-17");
    const r = parse("Buy milk", ctx);
    const plain = r.ok ? fileLine("Buy milk", r, projects, ctx, chooseProject(r.draft, projects, null, false)) : null;
    expect(plain && fileHere(plain, false, NOWHERE)).toBe(plain);
  });
});
