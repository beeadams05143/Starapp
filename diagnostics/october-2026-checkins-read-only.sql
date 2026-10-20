-- Run one numbered query at a time in the Supabase SQL Editor.
-- All statements are SELECT-only. No full payloads, notes, names, or emails are returned.

-- 1. LIVE SCHEMA: run first. Includes discovered check-in/report tables or views.
SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name IN ('caregiver_checkins', 'calendar_events', 'mood_entries',
                      'caregiver_checkin_configs', 'groups', 'group_members', 'profiles')
       OR table_name ILIKE '%checkin%' OR table_name ILIKE '%check_in%'
       OR table_name ILIKE '%report%')
ORDER BY table_name, ordinal_position;

-- 2. GROUP INVENTORY: IDs and counts only. Do not infer the correct group from size.
-- Compare with the active group ID in STAR. Null means no database group is assigned.
SELECT group_id, count(*) AS total_checkins,
       count(*) FILTER (WHERE date IS NULL) AS null_database_dates,
       count(*) FILTER (WHERE date >= DATE '2026-09-30'
                         AND date < DATE '2026-10-10') AS nearby_database_dates
FROM public.caregiver_checkins
GROUP BY group_id
ORDER BY group_id;

-- 3. TARGET RECORD AUDIT.
-- Replace PASTE_ACTIVE_GROUP_ID with STAR's actual active group UUID (keep quotes).
-- Deliberately searches ALL groups for nearby dates so misfiled records are visible.
-- Uses Sep 30 through Oct 9 inclusive to include adjacent-day shifts in either direction.
-- Also includes all undated rows in the expected group, regardless of submission time.
-- Required types: date = date; created_at/submitted_at = timestamp with time zone;
-- payload = json or jsonb. If query 1 differs, stop and bring back its results.
WITH settings AS (
  SELECT 'PASTE_ACTIVE_GROUP_ID'::text AS expected_group,
         'America/New_York'::text AS comparison_timezone
), base AS (
  SELECT c.id, c.group_id, c.user_id, c.date AS database_date,
         c.payload::jsonb AS p,
         c.submitted_at, c.created_at,
         s.expected_group, s.comparison_timezone,
         (c.submitted_at AT TIME ZONE s.comparison_timezone)::date AS submitted_local_date,
         (c.created_at AT TIME ZONE s.comparison_timezone)::date AS created_local_date,
         count(*) OVER (PARTITION BY c.group_id, c.user_id, c.date,
                                    c.payload::jsonb) AS same_user_date_payload_count
  FROM public.caregiver_checkins c CROSS JOIN settings s
), dates AS (
  SELECT b.*, picked.selected_field, picked.selected_key
  FROM base b
  LEFT JOIN LATERAL (
    SELECT v.field AS selected_field,
           CASE
             WHEN btrim(v.value) ~ '^\d{4}-\d{1,2}-\d{1,2}($|T\d{2}:\d{2})'
               THEN split_part(btrim(v.value), '-', 1) || '-' ||
                    lpad(split_part(btrim(v.value), '-', 2), 2, '0') || '-' ||
                    lpad(substring(split_part(btrim(v.value), '-', 3) from '^\d{1,2}'), 2, '0')
             WHEN btrim(v.value) ~ '^\d{1,2}/\d{1,2}/\d{4}$'
               THEN split_part(btrim(v.value), '/', 3) || '-' ||
                    lpad(split_part(btrim(v.value), '/', 1), 2, '0') || '-' ||
                    lpad(split_part(btrim(v.value), '/', 2), 2, '0')
           END AS selected_key
    FROM (VALUES (1, 'date', b.database_date::text),
                 (2, 'payload.entry_date', b.p->>'entry_date'),
                 (3, 'payload.date', b.p->>'date'),
                 (4, 'payload.shiftDate', b.p->>'shiftDate')) v(priority, field, value)
    WHERE btrim(v.value) ~ '^\d{4}-\d{1,2}-\d{1,2}($|T\d{2}:\d{2})'
       OR btrim(v.value) ~ '^\d{1,2}/\d{1,2}/\d{4}$'
    ORDER BY v.priority LIMIT 1
  ) picked ON true
)
SELECT id, group_id,
       coalesce(group_id::text = expected_group, false) AS matches_expected_group,
       database_date,
       p->>'entry_date' AS payload_entry_date,
       p->>'date' AS payload_date,
       p->>'shiftDate' AS payload_shift_date,
       p->>'group_id' AS payload_group_id,
       p->>'group' AS payload_group,
       p->>'calendar_only' AS payload_calendar_only,
       selected_field, selected_key AS selected_date_candidate,
       submitted_at AT TIME ZONE 'UTC' AS submitted_utc,
       submitted_local_date, created_local_date,
       comparison_timezone,
       CASE WHEN selected_key IS NOT NULL AND submitted_local_date IS NOT NULL
            THEN selected_key <> submitted_local_date::text END AS submitted_on_different_local_day,
       count(*) OVER (PARTITION BY group_id, user_id, selected_key) AS same_caregiver_selected_day_count,
       same_user_date_payload_count
FROM dates
WHERE database_date BETWEEN DATE '2026-09-30' AND DATE '2026-10-09'
   OR selected_key BETWEEN '2026-09-30' AND '2026-10-09'
   OR submitted_local_date BETWEEN DATE '2026-09-30' AND DATE '2026-10-09'
   OR created_local_date BETWEEN DATE '2026-09-30' AND DATE '2026-10-09'
   OR (group_id::text = expected_group AND selected_key IS NULL)
   -- Also search payload dates even when the database date takes precedence.
   OR EXISTS (
     SELECT 1 FROM (VALUES (p->>'entry_date'), (p->>'date'), (p->>'shiftDate')) v(value)
     WHERE btrim(value) ~ '^2026-(09-30|10-0[1-9])($|T)'
        OR btrim(value) ~ '^(9/30|10/[1-9])/2026$'
   )
ORDER BY group_id, database_date NULLS LAST, id;
-- selected_date_candidate is diagnostic string normalization, not a validated date.
-- Impossible values such as 02/30/2026 must be reviewed; the app rejects them.
-- Counts >1 identify POSSIBLE duplicates, not proof that a record should be deleted.

-- 4. DISCOVER OTHER TOP-LEVEL JSON DATE FIELDS, without returning their values.
-- Replace PASTE_ACTIVE_GROUP_ID. Includes all records in that group so an unknown
-- date field on an otherwise undated record is not missed.
SELECT field.key AS payload_field, count(*) AS records_with_field,
       count(*) FILTER (WHERE field.value <> 'null'::jsonb) AS non_null_values
FROM public.caregiver_checkins c
CROSS JOIN LATERAL jsonb_each(
  CASE WHEN jsonb_typeof(c.payload::jsonb) = 'object'
       THEN c.payload::jsonb ELSE '{}'::jsonb END
) field
WHERE c.group_id::text = 'PASTE_ACTIVE_GROUP_ID'
  AND field.key ~* '(date|submitted|created|timestamp|shift)'
GROUP BY field.key
ORDER BY field.key;

-- 5. RELATED CALENDAR RECORDS: dates and event types only, never notes/titles.
-- Run after query 1 confirms calendar_events and these columns exist.
-- All groups are searched to reveal a group mismatch; compare the returned IDs.
SELECT id, group_id, start_date, type,
       coalesce(group_id::text = 'PASTE_ACTIVE_GROUP_ID', false) AS matches_expected_group
FROM public.calendar_events
WHERE start_date >= DATE '2026-09-30' AND start_date < DATE '2026-10-10'
ORDER BY group_id, start_date, id;
-- type = health-flag is a calendar annotation, not a caregiver check-in.

-- 6. READ ACCESS METADATA: explains why SQL Editor and the signed-in app may differ.
SELECT schemaname, tablename, policyname, roles, cmd, qual AS read_policy_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('caregiver_checkins', 'calendar_events')
  AND cmd IN ('SELECT', 'ALL')
ORDER BY tablename, policyname;

-- 7. OTHER REPORT INPUTS: mood_entries contributes to reports but is not a check-in.
-- Run only after query 1 confirms mood_entries exists. JSON projection tolerates
-- optional columns without assuming they exist; no mood/notes/content is returned.
SELECT to_jsonb(m)->>'id' AS id,
       to_jsonb(m)->>'group_id' AS group_id,
       to_jsonb(m)->>'date' AS stored_date,
       to_jsonb(m)->>'created_at' AS created_at,
       to_jsonb(m)->>'timestamp' AS stored_timestamp
FROM public.mood_entries m
WHERE left(to_jsonb(m)->>'date', 10) BETWEEN '2026-09-30' AND '2026-10-09'
   OR left(to_jsonb(m)->>'created_at', 10) BETWEEN '2026-09-30' AND '2026-10-09'
   OR left(to_jsonb(m)->>'timestamp', 10) BETWEEN '2026-09-30' AND '2026-10-09';
-- This is a broad textual timestamp-date search, not a local-day conversion.
-- A null group_id here does not establish group ownership.
