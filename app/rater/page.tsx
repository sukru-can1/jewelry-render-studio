"use client";

import { Check, Clock, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const dynamic = "force-dynamic";

type RenderJob = {
  id: string;
  status: string;
  outputPrefix: string;
  createdAt: string;
  updatedAt: string;
  recipe?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
};

function getRecipeName(job: RenderJob) {
  return typeof job.recipe?.name === "string" ? job.recipe.name : job.id.slice(0, 8);
}

function getJobImageUrl(job: RenderJob) {
  const output = job.result && typeof job.result === "object" && "output" in job.result ? (job.result.output as Record<string, unknown>) : null;
  if (!output) return "";
  if (typeof output.image_url === "string") return output.image_url;
  const imageBlob = output.image_blob;
  if (imageBlob && typeof imageBlob === "object" && typeof (imageBlob as Record<string, unknown>).url === "string") {
    return (imageBlob as Record<string, unknown>).url as string;
  }
  return "";
}

function statusIcon(status: string) {
  if (status === "COMPLETED") return <Check size={16} />;
  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) return <XCircle size={16} />;
  return <Clock size={16} />;
}

function statusClass(status: string) {
  if (status === "COMPLETED") return "done";
  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) return "bad";
  return "pending";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString();
}

export default function RenderRater() {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function refreshJobs() {
    try {
      const response = await fetch("/api/render-jobs", { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const next = (await response.json()) as RenderJob[];
      setJobs(next);
      setMessage(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load render jobs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshJobs();
    const timer = window.setInterval(refreshJobs, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const latest = useMemo(() => jobs.slice(0, limit), [jobs, limit]);
  const newest = latest[0] || null;
  const newestUrl = newest ? getJobImageUrl(newest) : "";

  return (
    <main className="liveShell">
      <header className="liveTop">
        <div>
          <p className="eyebrow">Ring99 live render board</p>
          <h1>Latest Renders</h1>
        </div>
        <div className="liveActions">
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            <option value={5}>Latest 5</option>
            <option value={10}>Latest 10</option>
            <option value={20}>Latest 20</option>
          </select>
          <button className="iconButton" onClick={refreshJobs} title="Refresh now">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <section className="liveSummary">
        <div>
          <strong>{loading ? "Loading" : `${latest.length} latest shown`}</strong>
          <span>{message || "Polling every 5 seconds"}</span>
        </div>
        {newest && (
          <div>
            <strong>Newest: {getRecipeName(newest)}</strong>
            <span>{newestUrl || "render image not ready yet"}</span>
          </div>
        )}
      </section>

      {newest && (
        <section className="latestPanel">
          <div className="latestPreview">
            {newestUrl ? <img src={newestUrl} alt={getRecipeName(newest)} /> : <div className="pendingPreview">Waiting for newest image</div>}
          </div>
          <div className="latestDetails">
            <p className="eyebrow">Newest render</p>
            <h2>{getRecipeName(newest)}</h2>
            <p className={`liveStatus ${statusClass(newest.status)}`}>
              {statusIcon(newest.status)} {newest.status}
            </p>
            <dl>
              <div>
                <dt>Created</dt>
                <dd>{formatTime(newest.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatTime(newest.updatedAt)}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{newest.outputPrefix}</dd>
              </div>
            </dl>
            {newestUrl && (
              <a className="secondary" href={newestUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={18} />
                Open Image
              </a>
            )}
            {newest.error && <p className="error">{newest.error}</p>}
          </div>
        </section>
      )}

      <section className="liveGrid">
        {latest.map((job, index) => {
          const imageUrl = getJobImageUrl(job);
          return (
            <article className="liveCard" key={job.id}>
              <div className="liveCardHead">
                <strong>{index + 1}. {getRecipeName(job)}</strong>
                <span className={`liveStatus ${statusClass(job.status)}`}>{statusIcon(job.status)} {job.status}</span>
              </div>
              {imageUrl ? (
                <img src={imageUrl} alt={getRecipeName(job)} />
              ) : (
                <div className="livePending">
                  <RefreshCw size={24} />
                  <p>{job.status}</p>
                </div>
              )}
              <div className="liveCardActions">
                <span>{formatTime(job.createdAt)}</span>
                {imageUrl && (
                  <a className="iconButton" href={imageUrl} target="_blank" rel="noreferrer" title="Open image">
                    <ExternalLink size={18} />
                  </a>
                )}
              </div>
              {job.error && <p className="error">{job.error}</p>}
            </article>
          );
        })}
      </section>
    </main>
  );
}
