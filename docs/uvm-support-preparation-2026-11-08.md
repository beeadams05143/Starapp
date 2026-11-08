# Understanding My Support Needs — UVM testing

Scope: staging/uvm-intern-sandbox; star-uvm-testing.netlify.app; isolated Supabase rjozzwmkvlndanoaghtc. Production remains unchanged.

## Experience

Caregiver dashboard → Understanding My Support Needs; My STAR → What Helps Me. Each linked individual starts blank. The seven sections follow Vermont's September 30, 2026 Therapeutic Support Plan template with 34 optional preparation questions and visible field references. This is preparation for professional consultation, not the completed official form, an assessment, approval, or a prerequisite to request support.

Individual perspective and team observations remain separate. The same device can be used with assistance; recorder identity and shared-device status are stamped by the database. Saved contributions are append-only, including follow-up corrections. Unsaved answers stay in memory while moving between questions; use Save contribution before closing or changing devices. The page warns before leaving with unsaved answers.

Section 4 organizes separate named concerns. Questions about crisis, medication, restrictions, and public safety gather existing-document references or questions for specialists; they do not generate clinical or restrictive instructions. Sensitive-history questions can be answered by requesting a private professional conversation.

Sources are explicit opt-in selections from the same individual's communication records or latest 30 explicitly assigned check-ins. Unassigned legacy check-ins are excluded. The database verifies group and individual ownership and creates the source snapshot from the real record, rather than trusting client-submitted source content. Check-in excerpts include caregiver, physical and behavior notes and recorded sleep hours; they are excerpts, not a complete check-in export. Source timestamps, record IDs, and attribution are retained. Up to ten sources can be attached per contribution.

Review & share provides a mapped seven-section outline, browser print/Save PDF, and text packet download with original perspective, words, assistance, concern, field, source excerpts, and outstanding sections. Daily supports points to current team documents and How I Communicate; preparation answers do not become active care instructions. Formal consultant authoring, signature/credential verification, and committee-approval workflows are not implemented.

## Validation

19 model/controller and existing communication/person-isolation regression tests passed. Includes optional answers, stable field mapping, selected-person writes, separate concern linkage, preserving words through navigation, own-account restrictions, clearing drafts on person change, packet attribution, and ambiguous-write confirmation using one UUID.

Authenticated database integration checks in tests/support-preparation-rls.sql passed in a rolled-back transaction: own-account and shared-device saves; database recorder stamping; server-built source snapshots; rejection of foreign-person source/concern links; immutable original words; rejection of client-stamped snapshots; cross-person and cross-group read/write denial. No QA records remain. Security advisors reported no findings for the new objects; unrelated existing notices remain.

Limit: no signed-in real-device walkthrough has been completed. Actual mobile microphone permissions/audio, layout and print/PDF output remain device checks.
