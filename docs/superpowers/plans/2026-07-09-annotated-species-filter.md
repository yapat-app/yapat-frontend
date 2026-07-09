# Annotated-Species Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users filter the "Filter" annotation mode feed to snippets already labeled with one or more chosen species.

**Architecture:** Add a `species` query param to the backend's `GET /api/feed/?method=filter` route, filtering via an EXISTS subquery against `ALSnippetAnnotation` (the superset table that captures labels from classic annotation, AL feedback, and ground-truth import). Add a "Species" multi-select to `ClassicFeedConfigModal.tsx`, populated by the existing `GET /api/pam-al/snippet-labels` endpoint so the dropdown and the filter always agree on what "annotated" means.

**Tech Stack:** FastAPI + SQLAlchemy (backend, repo at `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend`), React + TypeScript + Redux Toolkit + Ant Design (frontend, repo at `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-frontend`). These are two separate git repositories — commits in each task specify which repo they apply to.

**Spec:** See `docs/superpowers/specs/2026-07-09-annotated-species-filter-design.md` in the frontend repo for the full design rationale (why `ALSnippetAnnotation` over canonical `Annotation`, and the accepted `annotation_status` scope limitation).

---

### Task 1: Fix pre-existing SQLite test-fixture bug (required to run backend tests)

**Context:** The backend test suite currently fails to run at all in this environment — every single test in `tests/unit/` errors during the `reset_db` autouse fixture with `sqlite3.OperationalError: no such table: main.users`. This is pre-existing and unrelated to this feature (verified by reproducing it against the current `main` branch with zero code changes). Root cause: `Base.metadata` has tables with an unresolvable FK cycle (`datasets` ↔ `snippet_sets`, per the accompanying `SAWarning`), and SQLite's `drop_all` can't compute a safe drop order for connected tables while `PRAGMA foreign_keys=ON`. Disabling FK enforcement only around the drop step (re-enabling before tests run) fixes it without touching any model or production code. Without this fix, Task 2's TDD cycle cannot be verified in this environment.

**Files:**
- Modify: `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend/tests/conftest.py:15-21`

- [ ] **Step 1: Confirm the bug reproduces**

Run: `cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend && .venv/bin/pytest tests/unit/test_snippet_service.py -v`
Expected: Both tests `ERROR` at setup with `sqlite3.OperationalError: no such table: main.users`.

- [ ] **Step 2: Fix `reset_db` to disable FK enforcement only around the drop**

Replace:

```python
@pytest.fixture(autouse=True)
def reset_db(engine):
    # Drop everything
    Base.metadata.drop_all(bind=engine)
    # Recreate fresh tables
    Base.metadata.create_all(bind=engine)
    yield
```

with:

```python
@pytest.fixture(autouse=True)
def reset_db(engine):
    # SQLite can't compute a safe DROP order when tables have an unresolvable
    # FK cycle (e.g. datasets <-> snippet_sets), so foreign key enforcement
    # must be off for the drop step only. Re-enabled immediately after so
    # tests still run with FK enforcement on.
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.commit()
    Base.metadata.drop_all(bind=engine)
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    yield
```

Add `text` to the existing `from sqlalchemy import create_engine, event` import at the top of the file, making it:

```python
from sqlalchemy import create_engine, event, text
```

- [ ] **Step 3: Verify the fix**

Run: `cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend && .venv/bin/pytest tests/unit/ -q`
Expected: The 55 pre-existing `ERROR`s are gone. Any remaining failures (if any) are unrelated pre-existing issues, not `no such table` errors — do not attempt to fix unrelated failures as part of this task.

- [ ] **Step 4: Commit (backend repo)**

```bash
cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend
git add tests/conftest.py
git commit -m "$(cat <<'EOF'
fix: disable FK enforcement around test DB drop to fix SQLite cycle

Base.metadata.drop_all() cannot compute a safe order for the
datasets<->snippet_sets FK cycle under SQLite with foreign_keys=ON,
which broke every test in tests/unit/. FK enforcement is re-enabled
immediately after the drop so tests still run with it on.
EOF
)"
```

---

### Task 2: Backend — species filter in `get_feed_filter` (TDD)

**Files:**
- Modify: `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend/app/services/snippet_service.py:1-13` (imports), `:290-371` (`get_feed_filter`)
- Test: `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend/tests/unit/test_snippet_service.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test_snippet_service.py`:

```python
def test_get_feed_filter_by_species(db_session):
    from app.models.pam_active_learning import ALSnippetAnnotation, ALAnnotationSource
    from app.models.embedding import SnippetSetStatus

    ds = Dataset(name="D", source_uri="dummy")
    model = EmbeddingModel(
        name="birdnet",
        version="2.4",
        window_size=3.0,
        step_size=3.0,
        overlap=0.0,
    )
    db_session.add_all([ds, model])
    db_session.commit()

    ss = SnippetSet(
        dataset_id=ds.id,
        embedding_model_id=model.id,
        window_size=3.0,
        step_size=3.0,
        overlap=0.0,
        status=SnippetSetStatus.READY,
    )
    db_session.add(ss)
    db_session.commit()

    rec = Recording(
        dataset_id=ds.id,
        file_path="dummy.wav",
        file_name="dummy.wav",
        duration=10.0,
        sample_rate=44100,
        extra_metadata=None,
        audio_sha256="x",
    )
    db_session.add(rec)
    db_session.commit()

    s_owl = Snippet(recording_id=rec.id, snippet_set_id=ss.id, start_time=0.0, duration=3.0)
    s_wind = Snippet(recording_id=rec.id, snippet_set_id=ss.id, start_time=3.0, duration=3.0)
    s_unlabeled = Snippet(recording_id=rec.id, snippet_set_id=ss.id, start_time=6.0, duration=3.0)
    db_session.add_all([s_owl, s_wind, s_unlabeled])
    db_session.commit()

    db_session.add_all([
        ALSnippetAnnotation(
            dataset_id=ds.id, snippet_id=s_owl.id, label="Owl",
            source=ALAnnotationSource.USER,
        ),
        ALSnippetAnnotation(
            dataset_id=ds.id, snippet_id=s_wind.id, label="Wind",
            source=ALAnnotationSource.GROUND_TRUTH,
        ),
    ])
    db_session.commit()

    svc = SnippetService(db_session)

    owl_only = svc.get_feed_filter(dataset_id=ds.id, snippet_set_id=ss.id, species="Owl", limit=50)
    assert {s.id for s in owl_only} == {s_owl.id}

    owl_or_wind = svc.get_feed_filter(
        dataset_id=ds.id, snippet_set_id=ss.id, species="Owl,Wind", limit=50
    )
    assert {s.id for s in owl_or_wind} == {s_owl.id, s_wind.id}

    no_species_filter = svc.get_feed_filter(dataset_id=ds.id, snippet_set_id=ss.id, limit=50)
    assert {s.id for s in no_species_filter} == {s_owl.id, s_wind.id, s_unlabeled.id}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend && .venv/bin/pytest tests/unit/test_snippet_service.py::test_get_feed_filter_by_species -v`
Expected: `FAILED` — `TypeError: get_feed_filter() got an unexpected keyword argument 'species'`.

- [ ] **Step 3: Add the import**

In `app/services/snippet_service.py`, change:

```python
from app.models.snippet import Snippet
from app.models.annotation import Annotation
from app.models.recording import Recording
from app.models.embedding import SnippetSet, SnippetSetStatus
from app.models.dataset import Dataset
```

to:

```python
from app.models.snippet import Snippet
from app.models.annotation import Annotation
from app.models.recording import Recording
from app.models.embedding import SnippetSet, SnippetSetStatus
from app.models.dataset import Dataset
from app.models.pam_active_learning import ALSnippetAnnotation, ALAnnotationSource
```

- [ ] **Step 4: Add the `species` parameter and filter logic**

In `get_feed_filter`, change the signature:

```python
    def get_feed_filter(
        self,
        dataset_id: Optional[int] = None,
        snippet_set_id: Optional[int] = None,
        recording_id: Optional[int] = None,
        annotation_status: Optional[str] = "any",
        location: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Snippet]:
```

to:

```python
    def get_feed_filter(
        self,
        dataset_id: Optional[int] = None,
        snippet_set_id: Optional[int] = None,
        recording_id: Optional[int] = None,
        annotation_status: Optional[str] = "any",
        location: Optional[str] = None,
        species: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Snippet]:
```

Then replace the tail of the method — the blank line and three lines right after the location-filter block:

```python
                if matching_ids:
                    query = query.filter(Snippet.recording_id.in_(matching_ids))
                else:
                    return []

        all_snippets = query.all()
        random.shuffle(all_snippets)
        return all_snippets[skip:skip + limit]
```

with:

```python
                if matching_ids:
                    query = query.filter(Snippet.recording_id.in_(matching_ids))
                else:
                    return []

        # Species filter: comma-separated list of annotated species labels.
        # Matches ALSnippetAnnotation (a superset of canonical Annotation --
        # it also captures AL-mode feedback and ground-truth imports),
        # restricted to trusted sources. One row per (snippet, label), so
        # this naturally matches a snippet if ANY of its labels is selected.
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

        all_snippets = query.all()
        random.shuffle(all_snippets)
        return all_snippets[skip:skip + limit]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend && .venv/bin/pytest tests/unit/test_snippet_service.py -v`
Expected: All 3 tests in the file `PASSED` (the two pre-existing ones plus the new one).

- [ ] **Step 6: Run full backend unit suite for regressions**

Run: `cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend && .venv/bin/pytest tests/unit/ -q`
Expected: No new failures compared to the baseline established in Task 1 Step 3.

- [ ] **Step 7: Commit (backend repo)**

```bash
cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend
git add app/services/snippet_service.py tests/unit/test_snippet_service.py
git commit -m "$(cat <<'EOF'
feat: add species filter to get_feed_filter

Filters the classic "Filter" feed mode to snippets annotated with one
or more selected species, matched against ALSnippetAnnotation
(GROUND_TRUTH + USER sources) rather than canonical Annotation, since
it also captures AL-mode feedback and ground-truth imports.
EOF
)"
```

---

### Task 3: Backend — expose `species` on the feed API endpoint

**Files:**
- Modify: `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend/app/api/feed.py:86-87` (new query param), `:161-170` (forward to service)

- [ ] **Step 1: Add the query parameter**

In `get_feed`, change:

```python
        annotation_status: Optional[str] = Query(default="any", description="For 'filter' method: 'any' | 'annotated' | 'unannotated'"),
        location: Optional[str] = Query(default=None, description="For 'filter' method: comma-separated location values to filter by"),
```

to:

```python
        annotation_status: Optional[str] = Query(default="any", description="For 'filter' method: 'any' | 'annotated' | 'unannotated'"),
        location: Optional[str] = Query(default=None, description="For 'filter' method: comma-separated location values to filter by"),
        species: Optional[str] = Query(default=None, description="For 'filter' method: comma-separated annotated species labels to filter by"),
```

- [ ] **Step 2: Forward it to the service call**

Change:

```python
        elif method == "filter":
            snippets = snippet_service.get_feed_filter(
                dataset_id=dataset_id,
                snippet_set_id=snippet_set_id,
                recording_id=recording_id,
                annotation_status=annotation_status,
                location=location,
                skip=skip,
                limit=limit,
            )
```

to:

```python
        elif method == "filter":
            snippets = snippet_service.get_feed_filter(
                dataset_id=dataset_id,
                snippet_set_id=snippet_set_id,
                recording_id=recording_id,
                annotation_status=annotation_status,
                location=location,
                species=species,
                skip=skip,
                limit=limit,
            )
```

Do **not** add `species` to the `request_params` dict used for feed-snapshot persistence (lines ~179–192) — `location` is not included there either (pre-existing gap, out of scope for this change); stay consistent with that existing precedent.

- [ ] **Step 3: Sanity-check the app still imports cleanly**

Run: `cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend && .venv/bin/python -c "import app.api.feed"`
Expected: No output, exit code 0 (no syntax/import errors).

- [ ] **Step 4: Run full backend unit suite for regressions**

Run: `cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend && .venv/bin/pytest tests/unit/ -q`
Expected: Same result as Task 2 Step 6 (no new failures).

- [ ] **Step 5: Commit (backend repo)**

```bash
cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend
git add app/api/feed.py
git commit -m "$(cat <<'EOF'
feat: expose species query param on GET /api/feed/ for 'filter' method
EOF
)"
```

---

### Task 4: Frontend — species state and data loading in `useHubClassic`

**Files:**
- Modify: `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-frontend/src/types/index.ts` (`FeedParams` interface, ~line 532-540)
- Modify: `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-frontend/src/pages/annotationHub/useHubClassic.ts`

**Note:** This repo has no automated frontend test framework configured (no Jest/Vitest, no existing `*.test.ts(x)` files). Consistent with the existing codebase, this task has no automated tests — it's verified manually in Task 6.

- [ ] **Step 1: Add `species` to `FeedParams`**

In `src/types/index.ts`, change:

```typescript
export interface FeedParams {
  dataset_id?: number | null;
  recording_id?: number;
  method?: string;
  annotation_status?: "any" | "annotated" | "unannotated";
  location?: string;
  skip?: number;
  limit?: number;
}
```

to:

```typescript
export interface FeedParams {
  dataset_id?: number | null;
  recording_id?: number;
  method?: string;
  annotation_status?: "any" | "annotated" | "unannotated";
  location?: string;
  species?: string;
  skip?: number;
  limit?: number;
}
```

- [ ] **Step 2: Import `alApi` in `useHubClassic.ts`**

Change:

```typescript
import { datasetApi } from "../../services/api";
```

to:

```typescript
import { datasetApi } from "../../services/api";
import { alApi } from "../../services/alApi";
```

- [ ] **Step 3: Add species state**

Change:

```typescript
  const [filterLocations, setFilterLocations] = useState<string[]>([]);
  const [recordingLocations, setRecordingLocations] = useState<string[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
```

to:

```typescript
  const [filterLocations, setFilterLocations] = useState<string[]>([]);
  const [recordingLocations, setRecordingLocations] = useState<string[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [filterSpecies, setFilterSpecies] = useState<string[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<string[]>([]);
  const [speciesLoading, setSpeciesLoading] = useState(false);
```

- [ ] **Step 4: Load distinct annotated species when Filter mode is active**

Immediately after the existing `recordingLocations` effect (the one calling `datasetApi.getRecordingLocations`, ending around line 246 with its closing `}, [mode, classicDatasetId]);`), add a new effect:

```typescript
  useEffect(() => {
    if (mode !== "filter" || !classicDatasetId) {
      setSpeciesOptions([]);
      return;
    }
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    let cancelled = false;
    setSpeciesLoading(true);
    void alApi
      .getSnippetLabels(ds)
      .then((res) => {
        if (cancelled) return;
        const distinct = new Set<string>();
        res.items.forEach((item) => item.labels.forEach((label) => distinct.add(label)));
        setSpeciesOptions(Array.from(distinct).sort());
      })
      .catch(() => {
        if (!cancelled) setSpeciesOptions([]);
      })
      .finally(() => {
        if (!cancelled) setSpeciesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, classicDatasetId]);
```

- [ ] **Step 5: Include `species` in the filter-mode feed request**

In `handleGenerateFeed`, change:

```typescript
      } else if (mode === "filter") {
        rows = await dispatch(
          fetchSnippetFeed({
            dataset_id: dsId,
            limit: feedLimit,
            method: "filter",
            annotation_status: filterAnnotationStatus,
            ...(filterLocations.length > 0 ? { location: filterLocations.join(",") } : {}),
          }),
        ).unwrap();
```

to:

```typescript
      } else if (mode === "filter") {
        rows = await dispatch(
          fetchSnippetFeed({
            dataset_id: dsId,
            limit: feedLimit,
            method: "filter",
            annotation_status: filterAnnotationStatus,
            ...(filterLocations.length > 0 ? { location: filterLocations.join(",") } : {}),
            ...(filterSpecies.length > 0 ? { species: filterSpecies.join(",") } : {}),
          }),
        ).unwrap();
```

Then add `filterSpecies` to the `handleGenerateFeed` `useCallback` dependency array (currently `[classicDatasetId, mode, feedLimit, filterAnnotationStatus, filterLocations, similarityState, dispatch, hasClassicFeed, snippetError]`), making it:

```typescript
  }, [
    classicDatasetId,
    mode,
    feedLimit,
    filterAnnotationStatus,
    filterLocations,
    filterSpecies,
    similarityState,
    dispatch,
    hasClassicFeed,
    snippetError,
  ]);
```

- [ ] **Step 6: Return the new state from the hook**

In the `return { ... }` block, change:

```typescript
    filterLocations,
    setFilterLocations,
    recordingLocations,
    locationsLoading,
```

to:

```typescript
    filterLocations,
    setFilterLocations,
    recordingLocations,
    locationsLoading,
    filterSpecies,
    setFilterSpecies,
    speciesOptions,
    speciesLoading,
```

- [ ] **Step 7: Type-check**

Run: `cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-frontend && npx tsc --noEmit`
Expected: No new errors referencing `useHubClassic.ts`, `types/index.ts`, or `alApi.ts`. (Task 5 wires the remaining consumer, `ClassicFeedConfigModal.tsx` / `AnnotationHub.tsx` — if this step reports errors there about missing props, that's expected until Task 5 lands; re-run this check again at the end of Task 5 instead if so.)

- [ ] **Step 8: Commit (frontend repo)**

```bash
cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-frontend
git add src/types/index.ts src/pages/annotationHub/useHubClassic.ts
git commit -m "$(cat <<'EOF'
feat: load annotated species and thread species filter through useHubClassic

Sources the species list from the existing snippet-labels endpoint
(same data the backend species filter matches against) so the
dropdown and the filter can never disagree.
EOF
)"
```

---

### Task 5: Frontend — Species control in `ClassicFeedConfigModal` and prop wiring

**Files:**
- Modify: `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-frontend/src/pages/annotationHub/ClassicFeedConfigModal.tsx`
- Modify: `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-frontend/src/pages/AnnotationHub.tsx` (`<ClassicFeedConfigModal ... />` usage, ~lines 178-196)

- [ ] **Step 1: Add props to `ClassicFeedConfigModalProps`**

Change:

```typescript
  filterLocations: string[];
  onFilterLocationsChange: (v: string[]) => void;
  recordingLocations: string[];
  locationsLoading: boolean;
```

to:

```typescript
  filterLocations: string[];
  onFilterLocationsChange: (v: string[]) => void;
  recordingLocations: string[];
  locationsLoading: boolean;
  filterSpecies: string[];
  onFilterSpeciesChange: (v: string[]) => void;
  speciesOptions: string[];
  speciesLoading: boolean;
```

- [ ] **Step 2: Destructure the new props**

Change:

```typescript
  filterLocations,
  onFilterLocationsChange,
  recordingLocations,
  locationsLoading,
```

to:

```typescript
  filterLocations,
  onFilterLocationsChange,
  recordingLocations,
  locationsLoading,
  filterSpecies,
  onFilterSpeciesChange,
  speciesOptions,
  speciesLoading,
```

- [ ] **Step 3: Add the Species control**

In the `mode === "filter"` block, change:

```tsx
      {mode === "filter" && (
        <>
          <Form.Item
            label="Location"
            tooltip="Site or locality parsed from recording file names (PAM site code or FNJV locality)"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="Any location (select none/one/many)"
              loading={locationsLoading}
              value={filterLocations}
              onChange={(v) => onFilterLocationsChange(v)}
              onClear={() => onFilterLocationsChange([])}
              style={{ width: "100%" }}
              options={recordingLocations.map((loc) => ({
                value: loc,
                label: loc,
              }))}
              notFoundContent={
                locationsLoading
                  ? "Loading locations…"
                  : "No locations parsed from file names yet"
              }
            />
          </Form.Item>
          <Form.Item
            label="Annotation status"
            tooltip="Filter snippets by whether the current user has annotated them"
          >
```

to:

```tsx
      {mode === "filter" && (
        <>
          <Form.Item
            label="Location"
            tooltip="Site or locality parsed from recording file names (PAM site code or FNJV locality)"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="Any location (select none/one/many)"
              loading={locationsLoading}
              value={filterLocations}
              onChange={(v) => onFilterLocationsChange(v)}
              onClear={() => onFilterLocationsChange([])}
              style={{ width: "100%" }}
              options={recordingLocations.map((loc) => ({
                value: loc,
                label: loc,
              }))}
              notFoundContent={
                locationsLoading
                  ? "Loading locations…"
                  : "No locations parsed from file names yet"
              }
            />
          </Form.Item>
          <Form.Item
            label="Species"
            tooltip="Only show snippets already annotated with one or more of these species"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="Any species (select none/one/many)"
              loading={speciesLoading}
              value={filterSpecies}
              onChange={(v) => onFilterSpeciesChange(v)}
              onClear={() => onFilterSpeciesChange([])}
              style={{ width: "100%" }}
              options={speciesOptions.map((sp) => ({
                value: sp,
                label: sp,
              }))}
              notFoundContent={
                speciesLoading ? "Loading species…" : "No annotated species yet"
              }
            />
          </Form.Item>
          <Form.Item
            label="Annotation status"
            tooltip="Filter snippets by whether the current user has annotated them"
          >
```

- [ ] **Step 4: Thread the new props from `AnnotationHub.tsx`**

Change the `<ClassicFeedConfigModal ... />` invocation from:

```tsx
      <ClassicFeedConfigModal
        open={classic.classicConfigOpen}
        mode={mode}
        feedLimit={classic.feedLimit}
        onFeedLimitChange={classic.setFeedLimit}
        filterAnnotationStatus={classic.filterAnnotationStatus}
        onFilterAnnotationStatusChange={classic.setFilterAnnotationStatus}
        filterLocations={classic.filterLocations}
        onFilterLocationsChange={classic.setFilterLocations}
        recordingLocations={classic.recordingLocations}
        locationsLoading={classic.locationsLoading}
        similarityState={classic.similarityState}
        onSimilarityChange={classic.handleSimilarityChange}
        onCancel={() => classic.setClassicConfigOpen(false)}
        onOk={classic.handleGenerateFeed}
        okText="Apply"
        okDisabled={!classic.classicCanGenerate || classic.feedGenerateBusy}
        okLoading={classic.feedGenerateBusy}
      />
```

to:

```tsx
      <ClassicFeedConfigModal
        open={classic.classicConfigOpen}
        mode={mode}
        feedLimit={classic.feedLimit}
        onFeedLimitChange={classic.setFeedLimit}
        filterAnnotationStatus={classic.filterAnnotationStatus}
        onFilterAnnotationStatusChange={classic.setFilterAnnotationStatus}
        filterLocations={classic.filterLocations}
        onFilterLocationsChange={classic.setFilterLocations}
        recordingLocations={classic.recordingLocations}
        locationsLoading={classic.locationsLoading}
        filterSpecies={classic.filterSpecies}
        onFilterSpeciesChange={classic.setFilterSpecies}
        speciesOptions={classic.speciesOptions}
        speciesLoading={classic.speciesLoading}
        similarityState={classic.similarityState}
        onSimilarityChange={classic.handleSimilarityChange}
        onCancel={() => classic.setClassicConfigOpen(false)}
        onOk={classic.handleGenerateFeed}
        okText="Apply"
        okDisabled={!classic.classicCanGenerate || classic.feedGenerateBusy}
        okLoading={classic.feedGenerateBusy}
      />
```

- [ ] **Step 5: Type-check**

Run: `cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit (frontend repo)**

```bash
cd /Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-frontend
git add src/pages/annotationHub/ClassicFeedConfigModal.tsx src/pages/AnnotationHub.tsx
git commit -m "$(cat <<'EOF'
feat: add Species multi-select to Filter mode's feed config modal
EOF
)"
```

---

### Task 6: Manual verification in browser

**Context:** No frontend automated test framework exists in this repo, so this feature is verified by running it.

- [ ] **Step 1: Start the frontend dev server** via the `yapat-frontend-dev` preview server config (`.claude/launch.json`, `npm run dev` on port 3000) — use the preview tooling, not raw `npm run dev` in Bash.

- [ ] **Step 2: Confirm the backend is up**

The backend runs locally via `docker-compose` (containers `yapat-api`, `yapat-postgres`, `yapat-redis`, `yapat-celery-worker`, `yapat-celery-worker-pam-al`). The `docker-compose.override.yml` API command already includes `--reload`, so code edits from Tasks 2-3 take effect automatically without a manual restart.

Run: `docker ps --format "{{.Names}}\t{{.Status}}"`
Expected: `yapat-api` and `yapat-postgres` show `Up`. If not running, start with `docker compose up -d` from `/Users/prpr02-admin/Documents/DFKI/Project_Yapat/yapat-backend` (confirm with the user before running this, since bringing up shared local infra is worth a heads-up).

- [ ] **Step 3: Navigate to the Annotation Hub, select a dataset that has existing annotations, and switch to "Filter" mode**

- [ ] **Step 4: Open the feed config modal and confirm:**
  - A "Species" multi-select appears between Location and Annotation status.
  - It lists the dataset's actually-annotated species (not the full model vocabulary).
  - Selecting one or more species and clicking Apply returns only snippets labeled with (any of) those species.
  - Clearing the species selection and clicking Apply again returns the full unfiltered set (modulo Location/Annotation status).

- [ ] **Step 5: Check browser console and network tab for errors**

Use `preview_console_logs` and `preview_network` — confirm the `GET /api/feed/?method=filter&species=...` request includes the expected `species` param and returns a 200 with the expected snippet set.

- [ ] **Step 6: Report results to the user** with a screenshot of the Species dropdown and a summary of what was verified.
