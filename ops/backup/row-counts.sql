-- Exact row count of every table in the app's schema, as one JSON object:
-- {"AuditLog": 1200, "User": 14, ...}. Used to check a backup against the
-- live database and to confirm a restore brought everything back.
select coalesce(json_object_agg(t.tablename, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', t.tablename), false, true, '')))[1]::text::bigint order by t.tablename), '{}')
from pg_tables t
where t.schemaname = 'public';
