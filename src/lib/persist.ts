import * as z from "zod/mini";
import { pruneLabSnapshot, type LabSnapshot } from "@/lib/codec";

const LIBRARY_KEY = "daggerboard.library.v1";

export interface SavedLabModel {
  id: string;
  name: string;
  savedAt: string;
  snapshot: LabSnapshot;
}

const SavedModelWireSchema = z.object({
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.minLength(1), z.maxLength(64)),
  savedAt: z.string().check(z.minLength(1)),
  snapshot: z.unknown(),
});

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function loadLibrary(): SavedLabModel[] {
  const local = storage();
  if (!local) return [];
  try {
    const value = JSON.parse(local.getItem(LIBRARY_KEY) ?? "[]") as unknown[];
    return z
      .array(SavedModelWireSchema)
      .parse(value)
      .map((entry) => ({ ...entry, snapshot: pruneLabSnapshot(entry.snapshot) }));
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();

function writeLibrary(models: SavedLabModel[]): void {
  const local = storage();
  if (!local) return;
  try {
    local.setItem(LIBRARY_KEY, JSON.stringify(models));
  } catch {
    throw new Error("Browser storage is full; export JSON before saving another model.");
  }
  for (const listener of listeners) listener();
}

/**
 * `useSyncExternalStore` bindings for the saved library. The static export is
 * prerendered with no browser storage, so the server snapshot is empty and the
 * real one is only read once React is on the client — reading it during the
 * first render instead makes the markup disagree with the export and fails
 * hydration for anyone who already has a model saved.
 */
export function subscribeToLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const EMPTY_LIBRARY: SavedLabModel[] = [];
let cachedRaw: string | null = null;
let cachedLibrary: SavedLabModel[] = EMPTY_LIBRARY;

/** Cached by raw stored text so repeated renders get a stable array identity. */
export function librarySnapshot(): SavedLabModel[] {
  const raw = storage()?.getItem(LIBRARY_KEY) ?? null;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedLibrary = loadLibrary();
  }
  return cachedLibrary;
}

export function serverLibrarySnapshot(): SavedLabModel[] {
  return EMPTY_LIBRARY;
}

function identifier(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveToLibrary(name: string, snapshot: LabSnapshot): SavedLabModel {
  const entry: SavedLabModel = {
    id: identifier(),
    name: name.trim().slice(0, 64) || "Untitled model",
    savedAt: new Date().toISOString(),
    snapshot: pruneLabSnapshot(snapshot),
  };
  writeLibrary([entry, ...loadLibrary()].slice(0, 50));
  return entry;
}

export function duplicateLibraryEntry(entry: SavedLabModel): SavedLabModel {
  return saveToLibrary(`${entry.name} copy`, entry.snapshot);
}
