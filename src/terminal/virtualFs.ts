export type VNode = VDirectory | VFile;

interface VNodeMeta {
  owner: number;
  group: number;
  mode: number;
}

export interface VDirectory {
  kind: "dir";
  entries: Record<string, VNode>;
  owner: number;
  group: number;
  mode: number;
}

export interface VFile {
  kind: "file";
  content: string;
  executable: boolean;
  owner: number;
  group: number;
  mode: number;
}

export interface VStat {
  path: string;
  kind: "dir" | "file";
  executable?: boolean;
  owner: number;
  group: number;
  mode: number;
}

export interface ListEntry {
  name: string;
  node: VNode;
}

export interface ListResult {
  items: ListEntry[];
  singleFile: boolean;
  error?: string;
}

export type FsResult = { ok: true } | { ok: false; error: string };
export interface VirtualFSState {
  version: 1;
  root: VDirectory;
  cwd: string[];
  currentUid: number;
  currentGid: number;
}

interface RemoveOptions {
  recursive?: boolean;
  force?: boolean;
}

interface TouchOptions {
  noCreate?: boolean;
}

const ROOT_UID = 0;
const ROOT_GID = 0;
const DEFAULT_DIR_MODE = 0o755;
const DEFAULT_FILE_MODE = 0o644;
const DEFAULT_EXEC_MODE = 0o755;
const VIRTUAL_FS_STATE_VERSION = 1;

type Access = "read" | "write" | "execute";

const dir = (
  entries: Record<string, VNode> = {},
  owner = ROOT_UID,
  group = ROOT_GID,
  mode = DEFAULT_DIR_MODE
): VDirectory => ({
  kind: "dir",
  entries,
  owner,
  group,
  mode: mode & 0o777
});

const file = (
  content: string,
  executable = false,
  owner = ROOT_UID,
  group = ROOT_GID,
  mode = executable ? DEFAULT_EXEC_MODE : DEFAULT_FILE_MODE
): VFile => {
  const normalizedMode = executable ? mode | 0o111 : mode & ~0o111;
  return {
    kind: "file",
    content,
    executable: (normalizedMode & 0o111) !== 0,
    owner,
    group,
    mode: normalizedMode & 0o777
  };
};

const permissionMasks: Record<Access, [number, number, number]> = {
  read: [0o400, 0o040, 0o004],
  write: [0o200, 0o020, 0o002],
  execute: [0o100, 0o010, 0o001]
};

const hasMask = (mode: number, mask: number): boolean => {
  return (mode & mask) !== 0;
};

type NodeLookup =
  | { ok: true; node: VNode }
  | { ok: false; reason: "not-found" | "not-dir" | "permission" };

export class VirtualFS {
  private readonly root: VDirectory;
  private cwd: string[];
  private currentUid = ROOT_UID;
  private currentGid = ROOT_GID;
  private onDidMutate: (() => void) | null = null;

  constructor(initialCwd = "/") {
    this.root = dir({}, ROOT_UID, ROOT_GID, DEFAULT_DIR_MODE);
    this.cwd = this.resolve(initialCwd);
  }

  public setCredentials(uid: number, gid: number): void {
    this.currentUid = uid;
    this.currentGid = gid;
  }

  public setMutationListener(listener: (() => void) | null): void {
    this.onDidMutate = listener;
  }

  public getCredentials(): { uid: number; gid: number } {
    return {
      uid: this.currentUid,
      gid: this.currentGid
    };
  }

  public pwd(): string {
    return this.toPath(this.cwd);
  }

  public toAbsolute(path: string): string {
    return this.toPath(this.resolve(path));
  }

  public cd(path: string): FsResult {
    const targetParts = this.resolve(path);
    const lookup = this.getNodeWithAccess(targetParts);

    if (!lookup.ok) {
      if (lookup.reason === "permission") {
        return { ok: false, error: `cd: permission denied: ${path}` };
      }
      return { ok: false, error: `cd: no such file or directory: ${path}` };
    }

    const node = lookup.node;
    if (node.kind !== "dir") {
      return { ok: false, error: `cd: not a directory: ${path}` };
    }

    if (!this.hasPermission(node, "execute")) {
      return { ok: false, error: `cd: permission denied: ${path}` };
    }

    this.cwd = targetParts;
    this.notifyMutation();
    return { ok: true };
  }

  public mkdir(path: string): FsResult {
    const targetParts = this.resolve(path);
    if (targetParts.length === 0) {
      return { ok: true };
    }

    let current: VDirectory = this.root;
    let changed = false;
    for (const part of targetParts) {
      if (!this.hasPermission(current, "execute")) {
        return { ok: false, error: `mkdir: cannot create directory '${path}': Permission denied` };
      }

      const next = current.entries[part];
      if (!next) {
        if (!this.hasPermission(current, "write")) {
          return { ok: false, error: `mkdir: cannot create directory '${path}': Permission denied` };
        }

        const created = dir({}, this.currentUid, this.currentGid, DEFAULT_DIR_MODE);
        current.entries[part] = created;
        current = created;
        changed = true;
        continue;
      }

      if (next.kind !== "dir") {
        return { ok: false, error: `mkdir: cannot create directory '${path}': Not a directory` };
      }

      current = next;
    }

    if (changed) {
      this.notifyMutation();
    }
    return { ok: true };
  }

  public writeFile(path: string, content: string, options?: { executable?: boolean }): FsResult {
    const parts = this.resolve(path);
    const name = parts[parts.length - 1];
    if (!name) {
      return { ok: false, error: `write: invalid file path: ${path}` };
    }

    const parentParts = parts.slice(0, -1);
    const parentLookup = this.getNodeWithAccess(parentParts);
    if (!parentLookup.ok) {
      if (parentLookup.reason === "permission") {
        return { ok: false, error: `write: ${path}: Permission denied` };
      }
      return { ok: false, error: `write: cannot create '${path}': No such file or directory` };
    }

    if (parentLookup.node.kind !== "dir") {
      return { ok: false, error: `write: cannot create '${path}': Not a directory` };
    }

    const parent = parentLookup.node;
    if (!this.hasPermission(parent, "execute")) {
      return { ok: false, error: `write: ${path}: Permission denied` };
    }

    const existing = parent.entries[name];
    if (existing && existing.kind === "dir") {
      return { ok: false, error: `write: ${path}: Is a directory` };
    }

    let owner = this.currentUid;
    let group = this.currentGid;
    let executable = options?.executable ?? false;
    let mode = executable ? DEFAULT_EXEC_MODE : DEFAULT_FILE_MODE;

    if (existing && existing.kind === "file") {
      if (!this.hasPermission(existing, "write")) {
        return { ok: false, error: `write: ${path}: Permission denied` };
      }

      owner = existing.owner;
      group = existing.group;
      executable = options?.executable ?? existing.executable;
      mode = existing.mode;
      if (options?.executable !== undefined) {
        mode = executable ? mode | 0o111 : mode & ~0o111;
      }
    } else {
      if (!this.hasPermission(parent, "write")) {
        return { ok: false, error: `write: ${path}: Permission denied` };
      }
      if (options?.executable !== undefined) {
        mode = executable ? DEFAULT_EXEC_MODE : DEFAULT_FILE_MODE;
      }
    }

    parent.entries[name] = file(content, executable, owner, group, mode);
    this.notifyMutation();
    return { ok: true };
  }

  public touch(path: string, options?: TouchOptions): FsResult {
    const noCreate = options?.noCreate ?? false;
    const parts = this.resolve(path);
    const name = parts[parts.length - 1];
    if (!name) {
      return { ok: false, error: `touch: cannot touch '${path}': Invalid path` };
    }

    const parentParts = parts.slice(0, -1);
    const parentLookup = this.getNodeWithAccess(parentParts);
    if (!parentLookup.ok) {
      if (parentLookup.reason === "permission") {
        return { ok: false, error: `touch: cannot touch '${path}': Permission denied` };
      }
      return { ok: false, error: `touch: cannot touch '${path}': No such file or directory` };
    }

    if (parentLookup.node.kind !== "dir") {
      return { ok: false, error: `touch: cannot touch '${path}': Not a directory` };
    }

    const parent = parentLookup.node;
    if (!this.hasPermission(parent, "execute")) {
      return { ok: false, error: `touch: cannot touch '${path}': Permission denied` };
    }

    const existing = parent.entries[name];
    if (existing) {
      if (existing.kind === "dir") {
        return { ok: false, error: `touch: cannot touch '${path}': Is a directory` };
      }

      if (!this.hasPermission(existing, "write")) {
        return { ok: false, error: `touch: cannot touch '${path}': Permission denied` };
      }

      this.notifyMutation();
      return { ok: true };
    }

    if (noCreate) {
      return { ok: true };
    }

    if (!this.hasPermission(parent, "write")) {
      return { ok: false, error: `touch: cannot touch '${path}': Permission denied` };
    }

    parent.entries[name] = file("", false, this.currentUid, this.currentGid, DEFAULT_FILE_MODE);
    this.notifyMutation();
    return { ok: true };
  }

  public chmod(path: string, executable: boolean): FsResult {
    const lookup = this.getNodeWithAccess(this.resolve(path));
    if (!lookup.ok) {
      if (lookup.reason === "permission") {
        return { ok: false, error: `chmod: cannot access '${path}': Permission denied` };
      }
      return { ok: false, error: `chmod: cannot access '${path}': No such file` };
    }

    const node = lookup.node;
    if (node.kind !== "file") {
      return { ok: false, error: `chmod: ${path}: Is a directory` };
    }

    if (!this.canAdminNode(node)) {
      return { ok: false, error: `chmod: changing permissions of '${path}': Operation not permitted` };
    }

    node.executable = executable;
    node.mode = executable ? node.mode | 0o111 : node.mode & ~0o111;
    this.notifyMutation();
    return { ok: true };
  }

  public chmodMode(path: string, mode: number): FsResult {
    const lookup = this.getNodeWithAccess(this.resolve(path));
    if (!lookup.ok) {
      if (lookup.reason === "permission") {
        return { ok: false, error: `chmod: cannot access '${path}': Permission denied` };
      }
      return { ok: false, error: `chmod: cannot access '${path}': No such file` };
    }

    const node = lookup.node;
    if (!this.canAdminNode(node)) {
      return { ok: false, error: `chmod: changing permissions of '${path}': Operation not permitted` };
    }

    node.mode = mode & 0o777;
    if (node.kind === "file") {
      node.executable = (node.mode & 0o111) !== 0;
    }
    this.notifyMutation();
    return { ok: true };
  }

  public chown(path: string, owner: number, group: number): FsResult {
    if (this.currentUid !== ROOT_UID) {
      return { ok: false, error: `chown: changing ownership of '${path}': Operation not permitted` };
    }

    const lookup = this.getNodeWithAccess(this.resolve(path));
    if (!lookup.ok) {
      if (lookup.reason === "permission") {
        return { ok: false, error: `chown: cannot access '${path}': Permission denied` };
      }
      return { ok: false, error: `chown: cannot access '${path}': No such file or directory` };
    }

    lookup.node.owner = owner;
    lookup.node.group = group;
    this.notifyMutation();
    return { ok: true };
  }

  public exportState(): VirtualFSState {
    return {
      version: VIRTUAL_FS_STATE_VERSION,
      root: this.cloneNode(this.root) as VDirectory,
      cwd: [...this.cwd],
      currentUid: this.currentUid,
      currentGid: this.currentGid
    };
  }

  public importState(rawState: unknown): boolean {
    if (!rawState || typeof rawState !== "object") {
      return false;
    }

    const state = rawState as Partial<VirtualFSState>;
    if (state.version !== VIRTUAL_FS_STATE_VERSION) {
      return false;
    }

    const root = this.deserializeNode(state.root);
    if (!root || root.kind !== "dir") {
      return false;
    }

    const cwd = this.deserializeCwd(state.cwd);
    if (!cwd) {
      return false;
    }

    const cwdNode = this.getNodeUnchecked(cwd, root);
    if (!cwdNode || cwdNode.kind !== "dir") {
      return false;
    }

    const nextUid = this.deserializeId(state.currentUid, ROOT_UID);
    const nextGid = this.deserializeId(state.currentGid, ROOT_GID);

    this.root.entries = root.entries;
    this.root.owner = root.owner;
    this.root.group = root.group;
    this.root.mode = root.mode;
    this.cwd = cwd;
    this.currentUid = nextUid;
    this.currentGid = nextGid;

    this.notifyMutation();
    return true;
  }

  public stat(path: string): VStat | null {
    const lookup = this.getNodeWithAccess(this.resolve(path));
    if (!lookup.ok) {
      return null;
    }

    const node = lookup.node;
    return {
      path: this.toAbsolute(path),
      kind: node.kind,
      executable: node.kind === "file" ? node.executable : undefined,
      owner: node.owner,
      group: node.group,
      mode: node.mode
    };
  }

  public exists(path: string): boolean {
    return this.getNodeWithAccess(this.resolve(path)).ok;
  }

  public isExecutable(path: string): boolean {
    const lookup = this.getNodeWithAccess(this.resolve(path));
    if (!lookup.ok) {
      return false;
    }

    const node = lookup.node;
    return node.kind === "file" && node.executable && this.hasPermission(node, "execute");
  }

  public list(path?: string): ListResult {
    const targetParts = path ? this.resolve(path) : [...this.cwd];
    const lookup = this.getNodeWithAccess(targetParts);

    if (!lookup.ok) {
      if (lookup.reason === "permission") {
        const label = path ?? this.pwd();
        return {
          items: [],
          singleFile: false,
          error: `ls: cannot open directory '${label}': Permission denied`
        };
      }

      return {
        items: [],
        singleFile: false,
        error: `ls: cannot access '${path ?? ""}': no such file or directory`
      };
    }

    const node = lookup.node;
    if (node.kind === "file") {
      if (!this.hasPermission(node, "read")) {
        return {
          items: [],
          singleFile: false,
          error: `ls: cannot access '${path ?? ""}': Permission denied`
        };
      }

      const fallback = targetParts[targetParts.length - 1] ?? path ?? "file";
      return {
        items: [{ name: fallback, node }],
        singleFile: true
      };
    }

    if (!this.hasPermission(node, "read") || !this.hasPermission(node, "execute")) {
      const label = path ?? this.pwd();
      return {
        items: [],
        singleFile: false,
        error: `ls: cannot open directory '${label}': Permission denied`
      };
    }

    const items = Object.entries(node.entries)
      .map(([name, child]) => ({ name, node: child }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { items, singleFile: false };
  }

  public readFile(path: string): { content: string } | { error: string } {
    const targetParts = this.resolve(path);
    const lookup = this.getNodeWithAccess(targetParts);

    if (!lookup.ok) {
      if (lookup.reason === "permission") {
        return { error: `cat: ${path}: Permission denied` };
      }
      return { error: `cat: ${path}: No such file or directory` };
    }

    const node = lookup.node;
    if (node.kind !== "file") {
      return { error: `cat: ${path}: Is a directory` };
    }

    if (!this.hasPermission(node, "read")) {
      return { error: `cat: ${path}: Permission denied` };
    }

    return { content: node.content };
  }

  public remove(path: string, options?: RemoveOptions): FsResult {
    const recursive = options?.recursive ?? false;
    const force = options?.force ?? false;
    const parts = this.resolve(path);
    if (parts.length === 0) {
      return { ok: false, error: `rm: cannot remove '/': Is a directory` };
    }

    const name = parts[parts.length - 1];
    if (!name) {
      return { ok: false, error: `rm: cannot remove '${path}': Invalid path` };
    }

    const parentParts = parts.slice(0, -1);
    const parentLookup = this.getNodeWithAccess(parentParts);
    if (!parentLookup.ok) {
      if (parentLookup.reason === "permission") {
        return { ok: false, error: `rm: cannot remove '${path}': Permission denied` };
      }

      if (force) {
        return { ok: true };
      }
      return { ok: false, error: `rm: cannot remove '${path}': No such file or directory` };
    }

    if (parentLookup.node.kind !== "dir") {
      return { ok: false, error: `rm: cannot remove '${path}': Not a directory` };
    }

    const parent = parentLookup.node;
    if (!this.hasPermission(parent, "execute") || !this.hasPermission(parent, "write")) {
      return { ok: false, error: `rm: cannot remove '${path}': Permission denied` };
    }

    const target = parent.entries[name];
    if (!target) {
      if (force) {
        return { ok: true };
      }
      return { ok: false, error: `rm: cannot remove '${path}': No such file or directory` };
    }

    if (target.kind === "dir") {
      if (!recursive) {
        return { ok: false, error: `rm: cannot remove '${path}': Is a directory` };
      }

      const prune = this.pruneDirectory(target, path);
      if (!prune.ok) {
        return prune;
      }
    }

    delete parent.entries[name];
    this.notifyMutation();
    return { ok: true };
  }

  public resolve(path: string): string[] {
    let safePath = path.trim();
    if (safePath.length === 0) {
      return [...this.cwd];
    }

    if (safePath === "~" || safePath.startsWith("~/")) {
      const home = this.resolveHomePathForCurrentUser();
      safePath = safePath === "~" ? home : `${home}/${safePath.slice(2)}`;
    }

    const segments = safePath.split("/");
    const resolved: string[] = safePath.startsWith("/") ? [] : [...this.cwd];

    for (const raw of segments) {
      const segment = raw.trim();
      if (!segment || segment === ".") {
        continue;
      }

      if (segment === "..") {
        resolved.pop();
        continue;
      }

      resolved.push(segment);
    }

    return resolved;
  }

  private resolveHomePathForCurrentUser(): string {
    if (this.currentUid === ROOT_UID) {
      const rootHome = this.getNodeUnchecked(["root"]);
      if (rootHome && rootHome.kind === "dir") {
        return "/root";
      }
    }

    const homeRoot = this.getNodeUnchecked(["home"]);
    if (homeRoot && homeRoot.kind === "dir") {
      for (const [name, node] of Object.entries(homeRoot.entries)) {
        if (node.kind === "dir" && node.owner === this.currentUid) {
          return `/home/${name}`;
        }
      }
    }

    return this.currentUid === ROOT_UID ? "/root" : "/home/guest";
  }

  private toPath(parts: string[]): string {
    if (parts.length === 0) {
      return "/";
    }
    return `/${parts.join("/")}`;
  }

  private getNodeWithAccess(parts: string[]): NodeLookup {
    let current: VNode = this.root;
    if (parts.length === 0) {
      return { ok: true, node: current };
    }

    for (const part of parts) {
      if (current.kind !== "dir") {
        return { ok: false, reason: "not-dir" };
      }

      if (!this.hasPermission(current, "execute")) {
        return { ok: false, reason: "permission" };
      }

      const next: VNode | undefined = current.entries[part];
      if (!next) {
        return { ok: false, reason: "not-found" };
      }

      current = next;
    }

    return { ok: true, node: current };
  }

  private canAdminNode(node: VNodeMeta): boolean {
    return this.currentUid === ROOT_UID || this.currentUid === node.owner;
  }

  private hasPermission(node: VNodeMeta, access: Access): boolean {
    if (this.currentUid === ROOT_UID) {
      return true;
    }

    const [userMask, groupMask, otherMask] = permissionMasks[access];
    if (this.currentUid === node.owner) {
      return hasMask(node.mode, userMask);
    }

    if (this.currentGid === node.group) {
      return hasMask(node.mode, groupMask);
    }

    return hasMask(node.mode, otherMask);
  }

  private getNodeUnchecked(parts: string[], start: VNode = this.root): VNode | undefined {
    let current: VNode = start;
    for (const part of parts) {
      if (current.kind !== "dir") {
        return undefined;
      }

      const next: VNode | undefined = current.entries[part];
      if (!next) {
        return undefined;
      }
      current = next;
    }
    return current;
  }

  private notifyMutation(): void {
    this.onDidMutate?.();
  }

  private cloneNode(node: VNode): VNode {
    if (node.kind === "file") {
      return {
        kind: "file",
        content: node.content,
        executable: node.executable,
        owner: node.owner,
        group: node.group,
        mode: node.mode
      };
    }

    const entries: Record<string, VNode> = {};
    for (const [name, child] of Object.entries(node.entries)) {
      entries[name] = this.cloneNode(child);
    }
    return {
      kind: "dir",
      entries,
      owner: node.owner,
      group: node.group,
      mode: node.mode
    };
  }

  private deserializeNode(raw: unknown): VNode | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const candidate = raw as Partial<VNode>;
    if (candidate.kind === "file") {
      if (typeof candidate.content !== "string") {
        return null;
      }

      const mode = this.deserializeMode((candidate as Partial<VFile>).mode, DEFAULT_FILE_MODE);
      return {
        kind: "file",
        content: candidate.content,
        executable: (mode & 0o111) !== 0,
        owner: this.deserializeId((candidate as Partial<VFile>).owner, ROOT_UID),
        group: this.deserializeId((candidate as Partial<VFile>).group, ROOT_GID),
        mode
      };
    }

    if (candidate.kind !== "dir") {
      return null;
    }

    const rawEntries = (candidate as Partial<VDirectory>).entries;
    if (!rawEntries || typeof rawEntries !== "object") {
      return null;
    }

    const entries: Record<string, VNode> = {};
    for (const [name, child] of Object.entries(rawEntries)) {
      if (!this.isValidEntryName(name)) {
        return null;
      }
      const parsedChild = this.deserializeNode(child);
      if (!parsedChild) {
        return null;
      }
      entries[name] = parsedChild;
    }

    return {
      kind: "dir",
      entries,
      owner: this.deserializeId((candidate as Partial<VDirectory>).owner, ROOT_UID),
      group: this.deserializeId((candidate as Partial<VDirectory>).group, ROOT_GID),
      mode: this.deserializeMode((candidate as Partial<VDirectory>).mode, DEFAULT_DIR_MODE)
    };
  }

  private deserializeCwd(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) {
      return null;
    }

    const parts: string[] = [];
    for (const entry of raw) {
      if (typeof entry !== "string") {
        return null;
      }

      const segment = entry.trim();
      if (!this.isValidEntryName(segment)) {
        return null;
      }
      parts.push(segment);
    }
    return parts;
  }

  private deserializeMode(raw: unknown, fallback: number): number {
    if (!Number.isInteger(raw)) {
      return fallback & 0o777;
    }
    return (raw as number) & 0o777;
  }

  private deserializeId(raw: unknown, fallback: number): number {
    if (!Number.isInteger(raw)) {
      return fallback;
    }
    const value = raw as number;
    if (value < 0) {
      return fallback;
    }
    return value;
  }

  private isValidEntryName(name: string): boolean {
    return name.length > 0 && name !== "." && name !== ".." && !name.includes("/");
  }

  private pruneDirectory(dir: VDirectory, path: string): FsResult {
    if (!this.hasPermission(dir, "execute") || !this.hasPermission(dir, "write")) {
      return { ok: false, error: `rm: cannot remove '${path}': Permission denied` };
    }

    for (const [name, child] of Object.entries(dir.entries)) {
      const childPath = path === "/" ? `/${name}` : `${path}/${name}`;
      if (child.kind === "dir") {
        const nested = this.pruneDirectory(child, childPath);
        if (!nested.ok) {
          return nested;
        }
      }
      delete dir.entries[name];
    }

    return { ok: true };
  }
}
