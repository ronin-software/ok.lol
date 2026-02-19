"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { Version } from "../actions";
import { deleteDocuments, getDocumentHistory, saveDocument } from "../actions";
import { useDocuments } from "./context";

/** Minimal doc info needed for the file tree. */
export type DocEntry = {
  /** True for system-provided defaults. */
  isDefault: boolean;
  /** Hierarchical path. */
  path: string;
};

type Props = {
  docs: DocEntry[];
  principalId: string;
};

export default function Sidebar({ docs, principalId }: Props) {
  const pathname = usePathname();
  const activePath = extractDocPath(pathname);

  return (
    <div className="flex h-full flex-col">
      <Explorer activePath={activePath} docs={docs} principalId={principalId} />
      <div className="min-h-0 flex-1 border-t border-zinc-800">
        <History activePath={activePath} principalId={principalId} />
      </div>
    </div>
  );
}

// –
// Explorer
// –

/** Tree node: either a directory or a leaf file. */
type TreeNode = {
  children: Map<string, TreeNode>;
  isDefault: boolean;
  path: string | null;
};

function buildTree(docs: DocEntry[]): TreeNode {
  const root: TreeNode = { children: new Map(), isDefault: false, path: null };
  for (const doc of [...docs].sort((a, b) => a.path.localeCompare(b.path))) {
    const segments = doc.path.split("/");
    let node = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (!node.children.has(seg)) {
        node.children.set(seg, { children: new Map(), isDefault: false, path: null });
      }
      node = node.children.get(seg)!;
    }
    node.path = doc.path;
    node.isDefault = doc.isDefault;
  }
  return root;
}

/** True when every leaf in a subtree is a default doc. */
function allDefaults(node: TreeNode): boolean {
  if (node.path !== null && !node.isDefault) return false;
  for (const child of node.children.values()) {
    if (!allDefaults(child)) return false;
  }
  return true;
}

function Explorer({ activePath, docs, principalId }: {
  activePath: string | null;
  docs: DocEntry[];
  principalId: string;
}) {
  const tree = useMemo(() => buildTree(docs), [docs]);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="flex h-10 items-center justify-between border-b border-zinc-800 px-3">
        <span className="text-xs font-medium text-zinc-400">Explorer</span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded px-2 py-0.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          +
        </button>
      </div>
      <div className="overflow-y-auto px-1 py-1">
        {creating && (
          <NewFileInput
            onCancel={() => setCreating(false)}
            principalId={principalId}
          />
        )}
        <TreeChildren activePath={activePath} depth={0} node={tree} principalId={principalId} />
      </div>
    </div>
  );
}

function TreeChildren({ activePath, depth, node, principalId }: {
  activePath: string | null;
  depth: number;
  node: TreeNode;
  principalId: string;
}) {
  const entries = Array.from(node.children.entries());
  return (
    <>
      {entries.map(([name, child]) => {
        const isDir = child.children.size > 0 && child.path === null
          ? true
          : child.children.size > 0;

        return isDir && !child.path
          ? <DirNode activePath={activePath} depth={depth} key={name} name={name} node={child} principalId={principalId} />
          : child.children.size > 0
            ? (
              <div key={name}>
                <FileNode activePath={activePath} depth={depth} isDefault={child.isDefault} name={name} path={child.path!} principalId={principalId} />
                <TreeChildren activePath={activePath} depth={depth + 1} node={child} principalId={principalId} />
              </div>
            )
            : <FileNode activePath={activePath} depth={depth} isDefault={child.isDefault} key={name} name={name} path={child.path!} principalId={principalId} />;
      })}
    </>
  );
}

function DirNode({ activePath, depth, name, node, principalId }: {
  activePath: string | null;
  depth: number;
  name: string;
  node: TreeNode;
  principalId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const isDeletable = !allDefaults(node);

  // Reconstruct the directory prefix from the tree path.
  const dirPath = reconstructPath(node);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!dirPath || !confirm(`Delete all documents under ${dirPath}/?`)) return;
    startTransition(async () => {
      await deleteDocuments(principalId, dirPath);
    });
  }

  return (
    <div>
      <div
        className="group flex w-full items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1">
          <span className="w-3 text-center text-[10px]">{open ? "▾" : "▸"}</span>
          <span className="truncate">{name}/</span>
        </button>
        {isDeletable && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="shrink-0 px-1 text-[10px] text-zinc-700 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
            aria-label={`Delete ${name}/`}
          >
            ×
          </button>
        )}
      </div>
      {open && <TreeChildren activePath={activePath} depth={depth + 1} node={node} principalId={principalId} />}
    </div>
  );
}

/** Walk up from a node to reconstruct its full path prefix. */
function reconstructPath(node: TreeNode): string | null {
  // Find any leaf path in the subtree and strip the leaf segment.
  for (const child of node.children.values()) {
    if (child.path) {
      const parts = child.path.split("/");
      parts.pop();
      return parts.join("/") || null;
    }
    const sub = reconstructPath(child);
    if (sub) return sub;
  }
  return null;
}

function FileNode({ activePath, depth, isDefault, name, path, principalId }: {
  activePath: string | null;
  depth: number;
  isDefault: boolean;
  name: string;
  path: string;
  principalId: string;
}) {
  const router = useRouter();
  const active = activePath === path;
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${path}"?`)) return;
    startTransition(async () => {
      await deleteDocuments(principalId, path);
      if (active) router.push("/dashboard/documents");
    });
  }

  return (
    <Link
      href={docHref(path)}
      className={[
        "group flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors",
        active
          ? "bg-zinc-800 text-white"
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
      ].join(" ")}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <span className="min-w-0 truncate">{name}</span>
      {isDefault && <span className="shrink-0 text-[10px] text-zinc-600">default</span>}
      {!isDefault && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="ml-auto shrink-0 px-1 text-[10px] text-zinc-700 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
          aria-label={`Delete ${name}`}
        >
          ×
        </button>
      )}
    </Link>
  );
}

function NewFileInput({ onCancel, principalId }: {
  onCancel: () => void;
  principalId: string;
}) {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    const trimmed = path.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await saveDocument(principalId, trimmed, "", 0);
      if (result.ok) {
        onCancel();
        router.push(docHref(trimmed));
      }
    });
  }

  return (
    <div className="mb-1 px-2 py-1">
      <input
        autoFocus
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        disabled={pending}
        onBlur={() => { if (!path.trim()) onCancel(); }}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="path/to/doc"
        value={path}
      />
    </div>
  );
}

// –
// History
// –

function History({ activePath, principalId }: {
  activePath: string | null;
  principalId: string;
}) {
  const { clearDiff, diffVersion, saveCount, setDiff } = useDocuments();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!activePath) { setVersions([]); return; }
    setLoading(true);
    const v = await getDocumentHistory(principalId, activePath);
    setVersions(v);
    setLoading(false);
  }, [activePath, principalId]);

  // Refetch when path or saveCount changes.
  useEffect(() => {
    fetchVersions();
  }, [fetchVersions, saveCount]);

  // Clear diff when navigating away.
  useEffect(() => { clearDiff(); }, [activePath, clearDiff]);

  if (!activePath) {
    return (
      <div className="px-3 py-3">
        <p className="text-xs text-zinc-600">Select a file to view history</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex h-10 items-center px-3">
        <span className="text-xs font-medium text-zinc-400">History</span>
      </div>
      <div className="overflow-y-auto px-1 py-1">
        {loading && versions.length === 0 && (
          <p className="px-2 py-2 text-xs text-zinc-600">Loading...</p>
        )}
        {!loading && versions.length === 0 && (
          <p className="px-2 py-2 text-xs text-zinc-600">No revisions yet</p>
        )}
        {versions.map((v, i) => {
          const previous = i < versions.length - 1
            ? versions[i + 1]?.content ?? ""
            : "";
          const isActive =
            diffVersion?.current === v.content &&
            diffVersion?.previous === previous;

          return (
            <button
              key={v.createdAt}
              type="button"
              onClick={() => isActive ? clearDiff() : setDiff(v.content, previous)}
              className={[
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
              ].join(" ")}
            >
              <span className="truncate">{timeago(v.createdAt)}</span>
              <span className="text-zinc-600">
                {v.editedBy === "user" ? "you" : "pal"}
              </span>
              {i === 0 && (
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                  current
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// –
// Helpers
// –

function timeago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Encode a document path as a URL, preserving `/` as separators. */
function docHref(path: string) {
  return `/dashboard/documents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Extract the document path from a pathname like /dashboard/documents/skills/research. */
function extractDocPath(pathname: string): string | null {
  const prefix = "/dashboard/documents/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  return rest ? decodeURIComponent(rest) : null;
}
