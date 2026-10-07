// Loose tasks in an area (20261007124400): tasks.area_id exists, a task is in a project or an area and never
// both whoever writes it (the tasks_filing trigger), and an area that is really removed leaves its tasks unfiled.
import { describe, expect, it } from "vitest";
import { asUser, inTx, newUser, spaceOf, tryConnect } from "./test-db";

const admin = await tryConnect();

describe.skipIf(admin === null)("task area contract", () => {
  it("filing a project task in an area clears its project and heading; filing it in a project clears the area", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "task-area-a@contract.test");
      const space = await spaceOf(c, me);
      const area = (await c.query<{ id: string }>("insert into public.areas (space_id, name, sort_key) values ($1, 'Work', 'a0') returning id", [space])).rows[0].id;
      const project = (await c.query<{ id: string }>("insert into public.projects (space_id, name, sort_key) values ($1, 'Q4 launch', 'a0') returning id", [space])).rows[0].id;
      const heading = (await c.query<{ id: string }>("insert into public.headings (space_id, project_id, title, sort_key) values ($1, $2, 'Copy', 'a0') returning id", [space, project])).rows[0].id;
      const task = (
        await c.query<{ id: string }>("insert into public.tasks (space_id, project_id, heading_id, title, sort_key, state) values ($1, $2, $3, 'Draft the Acme proposal', 'a0', 'active') returning id", [
          space,
          project,
          heading,
        ])
      ).rows[0].id;
      await asUser(c, me);
      const row = async () => (await c.query("select project_id::text, heading_id::text, area_id::text from public.tasks where id = $1", [task])).rows[0];

      // An older client that writes only area_id still ends up in the area alone.
      await c.query("update public.tasks set area_id = $2 where id = $1", [task, area]);
      expect(await row()).toEqual({ project_id: null, heading_id: null, area_id: area });

      // A project set without clearing the area wins over it.
      await c.query("update public.tasks set project_id = $2 where id = $1", [task, project]);
      expect(await row()).toEqual({ project_id: project, heading_id: null, area_id: null });

      // An insert carrying both keeps the project.
      const both = (
        await c.query<{ id: string }>("insert into public.tasks (space_id, project_id, area_id, title, sort_key, state) values ($1, $2, $3, 'Brief', 'a1', 'active') returning id", [space, project, area])
      ).rows[0].id;
      expect((await c.query("select project_id::text, area_id::text from public.tasks where id = $1", [both])).rows[0]).toEqual({ project_id: project, area_id: null });
    }));

  it("the app's own write (area set, project and heading cleared) goes through unchanged; a hard-deleted area leaves its tasks unfiled", () =>
    inTx(admin, async (c) => {
      const me = await newUser(c, "task-area-b@contract.test");
      const space = await spaceOf(c, me);
      const area = (await c.query<{ id: string }>("insert into public.areas (space_id, name, sort_key) values ($1, 'Home', 'a0') returning id", [space])).rows[0].id;
      const task = (await c.query<{ id: string }>("insert into public.tasks (space_id, title, sort_key, state) values ($1, 'Call the plumber', 'a0', 'inbox') returning id", [space])).rows[0].id;
      await asUser(c, me);
      await c.query("update public.tasks set area_id = $2, project_id = null, heading_id = null, state = 'active' where id = $1", [task, area]);
      expect((await c.query("select area_id::text, state from public.tasks where id = $1", [task])).rows[0]).toEqual({ area_id: area, state: "active" });
      await c.query("reset role");
      await c.query("delete from public.areas where id = $1", [area]);
      expect((await c.query("select area_id from public.tasks where id = $1", [task])).rows[0]).toEqual({ area_id: null });
    }));
});
