# Annotated-Species Filter for "Filter" Annotation Mode

## Problem

The Annotation Hub's `AnnotateMode = "filter"` ("Filter" mode, alongside Random,
Similarity, AL, and Validate) already lets users narrow the feed by Location
and Annotation Status (any/annotated/unannotated) via
`ClassicFeedConfigModal.tsx`. There is no way to narrow the feed to snippets
that have already been labeled with one or more specific species. Users want
to pick from a list of species that have actually been annotated in the
dataset, and see only snippets carrying (any of) those labels.

This is distinct from the `ALFilterPanel` visibility/color filter used in the
projection/DR scatter view (`ProjectionView.tsx`) — that is a client-side
filter over an already-fetched point set. This feature filters the
server-side feed query used by "Filter" mode.

## Data source

Two annotation tables exist in the backend:

- `Annotation` (canonical) — written only by the classic Annotation Hub flow
  (`POST /api/annotations`). Mirrored one-way into `ALSnippetAnnotation`
  (source=`USER`) on create/delete (`app/api/annotations.py:_mirror_to_al`).
  This is what the existing "Annotation status" filter in `get_feed_filter`
  checks.
- `ALSnippetAnnotation` — a superset. In addition to receiving the mirror
  above, it is written directly by:
  - AL/projection-view feedback submission (`source=USER`), which never
    touches canonical `Annotation`.
  - Ground-truth ingestion (`source=GROUND_TRUTH`), which also never touches
    canonical `Annotation`.
  - One row per `(snippet_id, label)` pair, so a multi-label snippet has
    multiple rows.

The species filter is sourced from `ALSnippetAnnotation`, restricted to
`source IN (GROUND_TRUTH, USER)` — the same restriction already used by
`list_snippet_labels` / `get_labels_by_snippet` (which back the existing
`actual_label` color filter and the `GET /api/pam-al/snippet-labels`
endpoint). This is the superset of "genuinely labeled" data and captures
species assigned through any annotation mode, not just the classic hub.

**Known scope limitation (explicitly accepted):** the existing "Annotation
status" filter (any/annotated/unannotated) in `get_feed_filter` still checks
only canonical `Annotation`. A snippet labeled solely through AL-mode
feedback or ground-truth import will match the new species filter but may
still show as "unannotated" under the status filter. This mismatch already
exists today (the status filter has always undercounted non-classic-mode
labels); this feature does not fix it. Broadening `annotation_status` is out
of scope for this change.

## Backend changes (`yapat-backend`)

### `app/services/snippet_service.py` — `get_feed_filter`

Add a `species: Optional[str] = None` parameter (comma-separated species
names). When non-empty, filter the query via an EXISTS subquery against
`ALSnippetAnnotation`, following the same style as the existing
`has_annotation` check in the same method:

```python
if species:
    wanted_species = {s.strip() for s in species.split(",") if s.strip()}
    if wanted_species:
        species_match = (
            self.db.query(ALSnippetAnnotation.id)
            .filter(
                ALSnippetAnnotation.snippet_id == Snippet.id,
                ALSnippetAnnotation.source.in_(
                    [ALAnnotationSource.GROUND_TRUTH, ALAnnotationSource.USER]
                ),
                ALSnippetAnnotation.label.in_(wanted_species),
            )
            .exists()
        )
        query = query.filter(species_match)
```

Requires importing `ALSnippetAnnotation`, `ALAnnotationSource` from
`app.models.pam_active_learning` (a models-layer import, consistent with the
existing import in `app/api/annotations.py`).

Because `ALSnippetAnnotation` stores one row per label, the `label.in_(...)`
EXISTS check naturally matches a snippet if *any* of its labels is in the
selected set — no extra logic needed for multi-label snippets.

### `app/api/feed.py` — `GET /api/feed/`

Add a `species: Optional[str] = Query(default=None, description="For 'filter' method: comma-separated species labels to filter by")`
parameter, forwarded to `snippet_service.get_feed_filter(...)` only when
`method == "filter"`.

### No new endpoint for populating the species list

The frontend reuses the existing `GET /api/pam-al/snippet-labels` endpoint
(already implemented, already used by `ProjectionView.tsx` for the
`actual_label` color filter) to source the distinct species list for the
dropdown. Because both the dropdown and the backend filter draw from the
same `ALSnippetAnnotation` (`GROUND_TRUTH`/`USER`) data, the list shown to
the user and what the filter can actually match will never disagree.

## Frontend changes (`yapat-frontend`)

### `src/types/index.ts` — `FeedParams`

Add `species?: string;` (comma-separated). No thunk or API-layer changes are
needed — `fetchSnippetFeed` (`redux/features/snippetSlice.ts`) forwards the
whole `FeedParams` object generically to `snippetApi.getFeed`, which spreads
it into axios query params (same mechanism already used by `location`).

### `src/pages/annotationHub/ClassicFeedConfigModal.tsx`

Add a "Species" control next to the existing Location multi-select
(lines ~76–100), rendered only when `mode === "filter"`:

- Ant Design `Select mode="multiple" allowClear`, matching the Location
  control's existing pattern.
- Options are populated by calling `alApi.getSnippetLabels(datasetId,
  snippetSetId)` when the modal opens (mirrors how the Location list is
  fetched via `datasetApi.getRecordingLocations`), then flattening and
  deduplicating the `labels` arrays from the response, sorted alphabetically.
- A loading state analogous to `locationsLoading` guards the dropdown while
  the label list is being fetched.

### `src/pages/annotationHub/useHubClassic.ts`

- Add `filterSpecies: string[]` state (default `[]`), alongside the existing
  `filterAnnotationStatus` / `filterLocations` state.
- In `handleGenerateFeed` (feed request construction, ~lines 270–279),
  include `species: filterSpecies.join(",")` in the `fetchSnippetFeed` call
  only when `filterSpecies.length > 0` — same conditional-inclusion pattern
  already used for `location`.

## Filter semantics

- Species selection is multi-select; a snippet matches if it carries *any*
  selected species (OR).
- Species combines with Location and Annotation Status via AND, matching the
  existing behavior of those two filters combining with each other.
- An empty species selection means "no species restriction" (same as
  today's empty Location selection).

## Out of scope

- Broadening `annotation_status` to consider `ALSnippetAnnotation` (accepted
  limitation, see above).
- Any change to the `ALFilterPanel` visibility/color filter in
  `ProjectionView.tsx` — that system is unrelated to this feature and is not
  touched.
- A dedicated backend endpoint for distinct species (reusing
  `/api/pam-al/snippet-labels` is sufficient and keeps dropdown/filter data
  in sync).
