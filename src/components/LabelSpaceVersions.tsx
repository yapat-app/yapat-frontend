import { useEffect, useMemo } from "react";
import { Button, Collapse, Empty, List, Spin, Tag, Tooltip, message } from "antd";
import { CrownOutlined, CheckCircleFilled } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../hooks";
import { useTeamOwnership } from "../hooks/useTeamOwnership";
import {
  fetchActiveLabelSpace,
  fetchLabelSpaceSubmissions,
  promoteVersion,
  clearPromoteSuccess,
} from "../redux/features/labelSpaceVersionSlice";
import type { CustomTaxonomyVersion, LabelSpaceItem } from "../types";

interface LabelSpaceVersionsProps {
  teamId?: number;
}

const formatDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

const speciesCount = (v: CustomTaxonomyVersion) =>
  v.taxonomy_data?.nodes?.length ?? 0;

const taxonKey = (item: { taxon_id?: string; id?: string }) =>
  (item.taxon_id ?? item.id ?? "").toString().toLowerCase();

/**
 * Full label list of one version. When `baselineIds` is provided (the active
 * version's taxon ids), labels not in it are flagged "New" (added vs the active
 * version) so the owner can compare versions at a glance.
 */
const VersionLabels = ({
  nodes,
  baselineIds,
}: {
  nodes: LabelSpaceItem[];
  baselineIds?: Set<string>;
}) => (
  <List
    dataSource={nodes ?? []}
    size="small"
    split={false}
    locale={{ emptyText: "No labels in this version." }}
    renderItem={(item: LabelSpaceItem) => {
      const isNew = baselineIds != null && !baselineIds.has(taxonKey(item));
      return (
        <List.Item className="border-b border-gray-100 last:border-b-0">
          <div
            className={`w-full py-0.5 ${
              isNew ? "bg-green-50 border-l-2 border-green-400 pl-2 -ml-2" : ""
            }`}
          >
            <span className="font-ibm-sans text-sm! text-gray-900">
              {item.canonical_name || item.scientific_name || item.name}
            </span>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {isNew && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                  New
                </span>
              )}
              {item.metadata?.rank && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                  {item.metadata.rank}
                </span>
              )}
              {item.scientific_name &&
                item.scientific_name !==
                  (item.canonical_name || item.name) && (
                  <span className="text-xs text-blue-600 italic">
                    {item.scientific_name}
                  </span>
                )}
            </div>
          </div>
        </List.Item>
      );
    }}
  />
);

/**
 * Right-hand panel shown on the pre-annotation screen when the user is NOT
 * actively building a label space:
 * - Team owner: every version (active + submitted) as an accordion they can
 *   expand to preview and promote ("Make active").
 * - Team member: read-only preview of the current active version.
 */
export const LabelSpaceVersions = ({ teamId }: LabelSpaceVersionsProps) => {
  const dispatch = useAppDispatch();
  const {
    activeVersion,
    submissions,
    members,
    loadingActive,
    loadingSubmissions,
    promotingId,
    promoteSuccess,
    error,
  } = useAppSelector((s) => s.labelSpaceVersion);

  // Platform admins get the owner interface for every team; other users are
  // owners only where their membership role is "owner". `isOwner` is null while
  // resolving. This panel is only rendered for owners/admins (plain members get
  // the editable working list in LabelSpace), but we still branch defensively.
  const { isOwner } = useTeamOwnership(teamId);

  // Load the active version for everyone; owners also load submissions.
  useEffect(() => {
    if (teamId == null) return;
    dispatch(fetchActiveLabelSpace(teamId));
  }, [teamId, dispatch]);

  useEffect(() => {
    if (teamId == null || isOwner !== true) return;
    dispatch(fetchLabelSpaceSubmissions(teamId));
  }, [teamId, isOwner, dispatch]);

  useEffect(() => {
    if (promoteSuccess) {
      message.success("Active label space updated", undefined, () =>
        dispatch(clearPromoteSuccess()),
      );
      if (teamId != null) dispatch(fetchLabelSpaceSubmissions(teamId));
    }
  }, [promoteSuccess, teamId, dispatch]);

  useEffect(() => {
    if (error) message.error(error);
  }, [error]);

  const authorName = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of members) {
      map.set(m.user_id, m.full_name || m.username || `User ${m.user_id}`);
    }
    return (userId: number) => map.get(userId) || `User ${userId}`;
  }, [members]);

  // Owner/admin view: every version in one list (the backend already returns
  // only genuine label-space versions — is_label_space_version — so no client
  // filtering needed), deduped and sorted active-first. Declared before any
  // early return so hook order stays stable across renders.
  const allVersions: CustomTaxonomyVersion[] = useMemo(() => {
    const byId = new Map<number, CustomTaxonomyVersion>();
    for (const v of submissions) byId.set(v.id, v);
    if (activeVersion && !byId.has(activeVersion.id)) {
      byId.set(activeVersion.id, activeVersion);
    }
    return Array.from(byId.values()).sort(
      (a, b) => (isActiveVersion(b) ? 1 : 0) - (isActiveVersion(a) ? 1 : 0),
    );
    function isActiveVersion(v: CustomTaxonomyVersion) {
      return v.id === activeVersion?.id;
    }
  }, [activeVersion, submissions]);

  // Taxon ids of the active version — the baseline for the "New" (added) diff
  // shown when expanding other versions. Undefined when there's no active
  // version, so nothing is spuriously flagged as new.
  const baselineIds = useMemo<Set<string> | undefined>(() => {
    if (!activeVersion) return undefined;
    const s = new Set<string>();
    for (const n of activeVersion.taxonomy_data?.nodes ?? []) {
      const k = taxonKey(n);
      if (k) s.add(k);
    }
    return s;
  }, [activeVersion]);

  const handlePromote = (versionId: number) => {
    if (teamId == null) return;
    dispatch(promoteVersion({ teamId, taxonomyDbId: versionId }));
  };

  // The active label space is team-scoped; a teamless dataset has none.
  if (teamId == null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Empty description="This dataset isn't linked to a team, so it has no label space versions." />
      </div>
    );
  }

  // ---- Member view: read-only active version ----------------------------
  if (isOwner === false) {
    if (loadingActive) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Spin />
        </div>
      );
    }
    if (!activeVersion) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Empty description="No active label space yet. The team owner hasn't promoted a version." />
        </div>
      );
    }
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircleFilled style={{ color: "#52c41a" }} />
          <span className="font-ibm-sans text-sm font-semibold text-gray-900">
            {activeVersion.name}
          </span>
          <Tag color="green">Active</Tag>
          <span className="text-xs text-gray-500 ml-auto">
            {speciesCount(activeVersion)} labels
          </span>
        </div>
        <VersionLabels nodes={activeVersion.taxonomy_data?.nodes ?? []} />
      </div>
    );
  }

  // ---- Owner view: all versions (active + submitted) --------------------
  if (isOwner == null || loadingSubmissions || loadingActive) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (allVersions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Empty description="No label space versions yet. Ask a team member to build and submit one." />
      </div>
    );
  }

  const items = allVersions.map((v) => {
    // The team has exactly one active version — the one its active pointer
    // targets (activeVersion from GET /active-label-space). The `status` column
    // is unreliable here (legacy/auto rows default to "active"), so never flag
    // active from status.
    const active = v.id === activeVersion?.id;
    return {
      key: String(v.id),
      label: (
        <div className="flex items-center gap-2 w-full pr-2">
          <span className="font-ibm-sans text-sm font-semibold text-gray-900">
            {v.name}
          </span>
          {active && <Tag color="green">Active</Tag>}
          <span className="text-xs text-gray-500 ml-auto whitespace-nowrap">
            by {authorName(v.created_by_user_id)} · {speciesCount(v)} labels
            {formatDate(v.created_at) ? ` · ${formatDate(v.created_at)}` : ""}
          </span>
        </div>
      ),
      extra: active ? (
        <Tag color="green" icon={<CheckCircleFilled />}>
          Active
        </Tag>
      ) : (
        <Tooltip title="Make this the team's active label space">
          <Button
            size="small"
            type="primary"
            icon={<CrownOutlined />}
            loading={promotingId === v.id}
            onClick={(e) => {
              e.stopPropagation();
              handlePromote(v.id);
            }}
          >
            Make active
          </Button>
        </Tooltip>
      ),
      children: (
        <VersionLabels
          nodes={v.taxonomy_data?.nodes ?? []}
          // Don't diff the active version against itself; other versions show
          // their additions relative to the active one.
          baselineIds={active ? undefined : baselineIds}
        />
      ),
    };
  });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <p className="text-xs text-gray-500 mb-2">
        As team owner, pick which version becomes the active label space used for
        annotation. Expand any versions — you can open several at once to compare;
        labels marked{" "}
        <span className="font-semibold text-green-700">New</span> are additions
        over the active version.
      </p>
      <Collapse
        size="small"
        items={items}
        defaultActiveKey={activeVersion ? [String(activeVersion.id)] : undefined}
      />
    </div>
  );
};

export default LabelSpaceVersions;
