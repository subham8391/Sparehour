"use client";
// The task detail, wired to the local database: one query for the task, the
// project and area names for the breadcrumb, and the repositories for
// writes. It travels with the panel in one island (task-detail.tsx fetches
// it in idle time), so neither the queries nor the repositories ride in the
// shell's first download (SYSTEM_DESIGN.md §11.6).
import { useContext, useEffect } from "react";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { suggestEstimate } from "@/core/estimates";
import { toReminderSettings } from "@/core/notifications/quiet-hours";
import type { SeriesRepo } from "@/data/repositories/series-repo";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { setTook } from "@/data/repositories/took";
import { useBlockingOptional } from "@/features/blocking/blocking-provider";
import { learnedIsOld } from "@/features/estimates/learned-store";
import { useLearned } from "@/features/estimates/use-learned";
import { remindable } from "@/features/notifications/held-reminders";
import { useUndoSink } from "@/features/undo/undo-provider";
import { BlockRows } from "@/features/blocking/block-rows";
import { preloadMarkdown } from "@/ui/note-field";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { DefaultEstimate } from "./default-estimate";
import { requestOrganize } from "./organize";
import type { FieldRequest } from "./task-detail";
import { Opening } from "./task-detail-surface";
import { TaskDetailPanel } from "./task-detail-panel";
import { useChecklistRepo, useTagRepo } from "./use-repos";
import { useConvertToProject } from "./use-convert";
import { useTaskDetail } from "./use-task-detail";
import { useTaskRepo } from "./use-task-repo";

export function TaskDetail({ id, field = null, onClose }: { id: string; field?: FieldRequest | null; onClose: () => void }) {
  const repo = useTaskRepo();
  const db = useLocalDatabase() as LocalDatabase;
  const undo = useUndoSink();
  // How the person's estimates run (DECISIONS.md, amendment 2026-11-15): said under the Estimate, taken with a tap.
  const learned = useLearned();
  const defaultEstimate = useContext(DefaultEstimate);
  const checklistRepo = useChecklistRepo();
  const tagRepo = useTagRepo();
  const now = useNow();
  const { today, zone, row: settingsRow } = useLocalDay(now);
  const blocking = useBlockingOptional();
  // Convert to project closes the detail and opens the new project, cursor in its add row.
  const convert = useConvertToProject(repo, onClose);
  // The task and everything about it the panel shows: read in a web-free hook the Android app's detail shares (use-task-detail.ts).
  const { task, row, missing, project, area, projects, areas, headings, checklist, tags, allTags, exceptions } = useTaskDetail(id);

  // The notes' Markdown renderer is its own small chunk: fetched as the detail opens, so a note is drawn, not flashed as raw text.
  useEffect(() => void preloadMarkdown(), []);

  // The task left this device (completed elsewhere, dropped, synced away): close rather than show a blank.
  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);

  if (!task) return <Opening />;
  const patch = (p: TaskPatch) => void repo.update(task.id, p);
  // Series edits load with the recurrence engine (TaskRepo.series()), the first time one is used.
  const series = (edit: (s: SeriesRepo) => Promise<void>) => void repo.series().then(edit);
  return (
    <TaskDetailPanel
      task={task}
      projectName={project?.name ?? null}
      areaName={area?.name ?? null}
      projects={projects}
      areas={areas}
      headings={headings}
      onHeading={(headingId) => void repo.setHeading(task.id, headingId)}
      checklist={checklist}
      tags={tags}
      allTags={allTags}
      now={now}
      zone={zone}
      today={today}
      onPatch={patch}
      onChecklistAdd={(title, sortKey) => void checklistRepo.add(task.id, task.spaceId, title, sortKey)}
      onChecklistReorder={(itemId, sortKey) => void checklistRepo.reorder(itemId, sortKey)}
      onChecklistToggle={(itemId, done) => void checklistRepo.setDone(itemId, done)}
      onChecklistRename={(itemId, title) => void checklistRepo.rename(itemId, title)}
      onChecklistRemove={(itemId) => void checklistRepo.remove(itemId)}
      onTagAdd={(name) => void tagRepo.attach(task.id, task.spaceId, name)}
      onTagRemove={(tagId) => void tagRepo.detach(task.id, tagId)}
      onComplete={() => void repo.complete(task.id)}
      onReopen={() => void repo.reopen(task.id)}
      onSomeday={() => void repo.setState(task.id, "someday").then(onClose)}
      onDrop={() => void repo.setState(task.id, "dropped").then(onClose)}
      onBlock={blocking?.available ? () => blocking.blockTask(task.id) : undefined}
      // Under a block still to come, whether quiet hours will drop its reminder: asked only of a task a reminder is made for.
      blockRows={<BlockRows taskId={task.id} estimateMin={task.estimateMin} zone={zone} today={today} now={now} reminders={settingsRow && remindable(task.state) ? toReminderSettings(settingsRow) : null} />}
      took={row?.actual_min ?? null}
      onTook={(minutes) => void setTook(db, undo, task.id, minutes).then(learnedIsOld)}
      usual={suggestEstimate(learned, task, defaultEstimate)?.minutes ?? null}
      onConvert={() => void convert(task.id)}
      onDuplicate={() => requestOrganize({ kind: "duplicate", id: task.id })}
      onMovePicker={() => requestOrganize({ kind: "move", ids: [task.id] })}
      onTagPicker={() => requestOrganize({ kind: "tag", ids: [task.id] })}
      onCopyLink={() => requestOrganize({ kind: "copy-link", id: task.id })}
      onClose={onClose}
      fieldRequest={field}
      exceptions={exceptions}
      onSeriesDay={(choice, change) => series((s) => (choice === "once" ? s.moveOnce(task.id, change) : s.changeRuleFrom(task.id, change)))}
      onChangeRule={(rule, mode) => series((s) => s.changeRule(task.id, rule, mode))}
      onSkipOccurrence={() => series((s) => s.skip(task.id))}
      onPause={(until) => series((s) => s.pause(task.id, until))}
      onResume={() => series((s) => s.resume(task.id))}
    />
  );
}
