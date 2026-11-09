# Caregiver setup completion — live release requirement

The setup-completion fix is shared application behavior, with no UVM hostname or demo condition. Include both files when promoting testing features to live:

- `router.js`: recognize an existing group check-in configuration OR an active caregiver-specific assignment, persist onboarding completion, and route returning users to the dashboard.
- `caregiver-checkin-setup/index.html`: call `completeGuidedOnboarding` after a successful save so subsequent sign-ins use the persisted profile completion flag.
- Preserve the existing `completeGuidedOnboarding` implementation in `onboarding-flow.js` and its profile PATCH permissions.

Implementation commits: `8e08dc4aff21bad4c6f664bc3f34230b619738b9` and `b91be387eb80911a4c16c23c1a46e1e859894bd4`.

Before live release, verify: a completed profile goes to Dashboard; an older account with saved group setup goes to Dashboard; an older account with caregiver-specific setup goes to Dashboard even if the group configuration lookup fails; an account without saved setup still reaches setup; explicitly opening Check-in Setup from the dashboard remains available for editing. Verify completion persists after signing out and signing back in, including in a fresh browser session.

The caregiver assignment table must accompany the caregiver-specific feature transfer. This note does not deploy changes to live.
