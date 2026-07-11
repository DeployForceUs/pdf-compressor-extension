import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import browser from "webextension-polyfill";
import "../popup/styles.css";
import { logger } from "../../lib/monitoring/logger";
import { captureException, initSentry } from "../../lib/monitoring/sentry";
import {
  type AppResponse,
  type HealthCheckResponse,
  type InfoResponse,
  type StorageResponse,
  sendTypedMessage,
} from "../../lib/messaging";
import { useHealthStore } from "./store";

void initSentry("popup");

function App() {
  const { loading, background, offscreen, storage, lastError, setLoading, setBackground, setOffscreen, setStorage, setError } =
    useHealthStore();

  const runHealthCheck = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await sendTypedMessage<HealthCheckResponse>({ type: "health:check" });
      setBackground(response.details ?? "background ok");
      setOffscreen(response.offscreen ? "reported available" : "not yet checked");
      logger.info("Popup health check completed", response);
    } catch (error) {
      captureException(error, "popup");
      setError(error instanceof Error ? error.message : "Unknown popup error");
    } finally {
      setLoading(false);
    }
  };

  const runOffscreenCheck = async () => {
    setLoading(true);
    setError("");
    try {
      await sendTypedMessage({ type: "offscreen:open" });
      const response = await sendTypedMessage<InfoResponse>({ type: "offscreen:health" });
      setOffscreen(response.ok ? response.details ?? "offscreen ok" : response.error ?? "offscreen error");
    } catch (error) {
      captureException(error, "popup");
      setError(error instanceof Error ? error.message : "Unknown offscreen error");
    } finally {
      setLoading(false);
    }
  };

  const runStorageSmoke = async () => {
    setLoading(true);
    setError("");
    const key = "phase1-test-buffer";
    const bytes = [3, 1, 4, 1, 5, 9];
    try {
      await sendTypedMessage({ type: "offscreen:open" });
      const writeResponse = await sendTypedMessage<StorageResponse>({ type: "storage:test-write", key, bytes });
      if (!writeResponse.ok) throw new Error(writeResponse.error);
      const writtenByteLength = writeResponse.byteLength ?? bytes.length;

      const compareResponse = await sendTypedMessage<StorageResponse>({ type: "storage:test-compare", key, bytes });
      if (!compareResponse.ok) throw new Error(compareResponse.error);

      const readResponse = await sendTypedMessage<StorageResponse>({ type: "storage:test-read", key });
      if (!readResponse.ok) throw new Error(readResponse.error);
      const readByteLength = readResponse.value instanceof ArrayBuffer ? readResponse.value.byteLength : bytes.length;

      const deleteResponse = await sendTypedMessage<StorageResponse>({ type: "storage:test-delete", key });
      if (!deleteResponse.ok) throw new Error(deleteResponse.error);

      const missingResponse = await sendTypedMessage<StorageResponse>({ type: "storage:test-read", key });
      if (!missingResponse.ok) throw new Error(missingResponse.error);
      if (missingResponse.value !== null && missingResponse.value !== undefined) {
        throw new Error("Deleted IndexedDB record still present");
      }

      setStorage(
        `saved ${writtenByteLength} bytes, read ${readByteLength} bytes, compare=${compareResponse.equal === true ? "match" : "mismatch"}, delete=ok, missing-record=verified`,
      );
    } catch (error) {
      captureException(error, "popup");
      setError(error instanceof Error ? error.message : "Unknown storage error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runHealthCheck();
  }, []);

  return (
    <main className="app">
      <section className="panel">
        <header className="hero">
          <p className="eyebrow">Phase 1 foundation</p>
          <h1>PDF Compressor</h1>
        </header>
        <div className="body">
          <div className="status-grid">
            <div className="status-row">
              <span className="status-label">Background</span>
              <span className="status-value">{background}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Offscreen</span>
              <span className="status-value">{offscreen}</span>
            </div>
            <div className="status-row">
              <span className="status-label">IndexedDB</span>
              <span className="status-value">{storage}</span>
            </div>
          </div>

          <div className="actions">
            <button type="button" onClick={() => void runHealthCheck()} disabled={loading}>
              Re-run background health check
            </button>
            <button type="button" className="secondary" onClick={() => void runOffscreenCheck()} disabled={loading}>
              Validate offscreen document
            </button>
            <button type="button" className="secondary" onClick={() => void runStorageSmoke()} disabled={loading}>
              Run IndexedDB smoke test
            </button>
          </div>

          {lastError ? <div className="error">{lastError}</div> : null}
          <div className="footnote">
            This popup only performs local health checks. No PDF bytes or user content are transmitted.
          </div>
        </div>
      </section>
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
