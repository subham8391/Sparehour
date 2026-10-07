// A task list's rows carry their tags' names (SCREENS.md §2.4 row anatomy: "· tags ·"), read in the list's own
// statement rather than one query per row: a correlated subquery on the task_tags index, its names joined by the
// unit separator (a name may hold a space). The mapper splits them (toTask → Task.tags). Tables the subquery reads
// are watched with the list's, so tagging a task redraws its row.
export const TAG_NAMES = `(select group_concat(g.name, char(31)) from task_tags x join tags g on g.id = x.tag_id and g.deleted_at is null where x.task_id = tasks.id and x.deleted_at is null) as tag_names`;
