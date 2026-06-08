"use client";

import * as React from "react";
import { upload } from "@vercel/blob/client";
import {
  CheckCircle2,
  CloudUpload,
  Loader2,
  RotateCcw,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ModelFormat } from "@/lib/validation/product";

// UI-SPEC §2 — first-party (Radix-free) model dropzone. Native drag-and-drop,
// validates extension + size client-side, then streams the file DIRECTLY to
// PRIVATE Blob via @vercel/blob/client `upload()`. The token route at
// /api/blob/upload also mints access:'private' (decision #2 — both sides).
//
// T-02-06: on success we surface only { pathname, format } to the parent — never
// result.url (the non-public URL). Nothing is persisted here.

// Allowed model extensions ↔ the zod modelFormatEnum (lowercased, no dot).
const ALLOWED_FORMATS: ModelFormat[] = ["glb", "fbx", "blend", "obj", "stl"];
const ACCEPT_ATTR = ALLOWED_FORMATS.map((f) => `.${f}`).join(",");
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

// Exact UI-SPEC Copywriting Contract strings.
const COPY = {
  idle: "Drag a model here or click to browse — GLB, FBX, BLEND, OBJ, or STL.",
  sizeHint: "Models up to ~50 MB. Large files may take a moment to upload.",
  wrongType:
    "That file type isn't supported. Use GLB, FBX, BLEND, OBJ, or STL.",
  tooLarge: "That model is larger than the 50 MB limit.",
  failed: "Couldn't upload that model. Check your connection and try again.",
} as const;

type DropzoneState = "idle" | "dragover" | "uploading" | "success" | "error";

export type UploadedModel = { pathname: string; format: ModelFormat };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function ModelDropzone({
  onUploaded,
  disabled,
}: {
  onUploaded: (model: UploadedModel | null) => void;
  disabled?: boolean;
}) {
  const [state, setState] = React.useState<DropzoneState>("idle");
  const [progress, setProgress] = React.useState(0);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileSize, setFileSize] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const isUploading = state === "uploading";

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setState("idle");
    setProgress(0);
    setFileName(null);
    setFileSize(null);
    setError(null);
    onUploaded(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setError(null);
    onUploaded(null);

    const ext = extensionOf(file.name);
    if (!ALLOWED_FORMATS.includes(ext as ModelFormat)) {
      setState("error");
      setError(COPY.wrongType);
      return;
    }
    if (file.size > MAX_BYTES) {
      setState("error");
      setError(COPY.tooLarge);
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    setProgress(0);
    setState("uploading");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await upload(file.name, file, {
        access: "private",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type || "application/octet-stream",
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });

      // T-02-06: surface only the PRIVATE pathname + format upward. Never the url.
      setProgress(100);
      setState("success");
      onUploaded({ pathname: result.pathname, format: ext as ModelFormat });
    } catch (err) {
      // An explicit cancel returns us to idle, not the error state.
      if (controller.signal.aborted) {
        reset();
        return;
      }
      setState("error");
      setError(COPY.failed);
      onUploaded(null);
      console.error("Model upload failed", err);
    } finally {
      abortRef.current = null;
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (disabled || isUploading) return;
    setState((s) => (s === "dragover" ? "idle" : s));
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (disabled || isUploading) return;
    setState("dragover");
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (state === "dragover") setState("idle");
  }

  function openPicker() {
    if (disabled || isUploading) return;
    inputRef.current?.click();
  }

  // ----- SUCCESS -----
  if (state === "success") {
    return (
      <div className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-4 text-center">
        <CheckCircle2
          className="size-5 text-primary"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{fileName}</p>
          {fileSize != null ? (
            <p className="font-mono text-xs text-muted-foreground">
              {formatBytes(fileSize)}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={disabled}
        >
          <RotateCcw className="size-4" />
          Replace
        </Button>
      </div>
    );
  }

  // ----- UPLOADING -----
  if (state === "uploading") {
    return (
      <div className="flex min-h-40 w-full flex-col justify-center gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <p className="truncate text-sm font-medium text-foreground">
            {fileName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={progress} className="flex-1" />
          <span className="w-10 text-right font-mono text-xs text-muted-foreground">
            {Math.round(progress)}%
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={reset}
        >
          Cancel
        </Button>
      </div>
    );
  }

  // ----- ERROR -----
  if (state === "error") {
    return (
      <div className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-lg border border-destructive bg-card p-4 text-center">
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="size-4" />
          Try again
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={onInputChange}
        />
      </div>
    );
  }

  // ----- IDLE / DRAG-OVER -----
  return (
    <button
      type="button"
      onClick={openPicker}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      disabled={disabled}
      aria-label="Upload a model file"
      className={cn(
        "flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card p-6 text-center transition-colors",
        "hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60",
        state === "dragover"
          ? "border-2 border-primary bg-primary/5"
          : "border-border",
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {state === "dragover" ? (
          <UploadCloud className="size-5" strokeWidth={1.75} aria-hidden />
        ) : (
          <CloudUpload className="size-5" strokeWidth={1.75} aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{COPY.idle}</p>
        <p className="text-xs text-muted-foreground">{COPY.sizeHint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={onInputChange}
      />
    </button>
  );
}
