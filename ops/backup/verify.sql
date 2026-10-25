-- Integrity checks run against a RESTORED copy (never production). Each
-- failed check raises an error, which fails the backup or restore job.
--
-- Foreign keys (manager, hotel, department, category, transaction links,
-- profile photos) are already proven by the restore itself: pg_restore
-- re-creates every constraint after loading the data and stops on any
-- violation. These checks cover what constraints can't.
do $$
declare
  n bigint;
begin
  -- The schema is complete: every migration applied, none half-applied.
  select count(*) into n from _prisma_migrations where finished_at is null or rolled_back_at is not null;
  if n > 0 then raise exception 'Restored schema has % unfinished or rolled-back migration(s)', n; end if;

  -- Someone can still sign in and run the system.
  select count(*) into n from "User" where role = 'ADMIN' and "disabledAt" is null;
  if n = 0 and exists (select 1 from "User") then
    raise exception 'No active Admin account in the restored data';
  end if;

  -- Everyone except Admins belongs to a hotel and department.
  select count(*) into n from "User" where role <> 'ADMIN' and ("hotelId" is null or "departmentId" is null);
  if n > 0 then raise exception '% non-Admin user(s) missing a hotel or department', n; end if;

  -- Granted permissions are all ones the app knows.
  select count(*) into n from "User", unnest("extraPermissions") p
  where p not in ('approve_requests', 'edit_items', 'view_analytics', 'reports', 'manage_categories', 'audit_log');
  if n > 0 then raise exception '% unknown permission grant(s)', n; end if;

  -- Nobody is their own manager.
  select count(*) into n from "User" where "managerId" = id;
  if n > 0 then raise exception '% user(s) set as their own manager', n; end if;

  -- Stock on hand is never negative.
  select count(*) into n from "InventoryItem" where "quantityOnHand" < 0;
  if n > 0 then raise exception '% item(s) with negative stock', n; end if;

  -- Profile photos are intact images of an allowed type.
  select count(*) into n from "UserAvatar"
  where "mimeType" not in ('image/jpeg', 'image/png', 'image/webp') or octet_length(data) = 0;
  if n > 0 then raise exception '% damaged profile photo(s)', n; end if;

  -- Every category's parent is in the same department.
  select count(*) into n from "Category" c join "Category" p on p.id = c."parentId" where p."departmentId" <> c."departmentId";
  if n > 0 then raise exception '% category/parent department mismatch(es)', n; end if;
end $$;

select 'Integrity checks passed';
