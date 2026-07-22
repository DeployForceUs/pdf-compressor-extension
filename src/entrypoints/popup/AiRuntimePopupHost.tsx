import { useEffect, useMemo, useState } from "react";
import { AiExecutionCoordinator } from "../../lib/ai-runtime/execution-coordinator.js";
import { AiRuntimeExecutionPanel } from "./AiRuntimeExecutionPanel.js";

export function AiRuntimePopupHost() {
  const coordinator = useMemo(() => new AiExecutionCoordinator({
    compression: { async start() {} },
    compressedResults: { async read() { return null; } },
  }), []);
  const [snapshot, setSnapshot] = useState(() => coordinator.snapshot());

  useEffect(() => {
    const next = coordinator.snapshot();
    setSnapshot(next);
    console.info("[AI Runtime] coordinator snapshot", next);
  }, [coordinator]);

  return <AiRuntimeExecutionPanel snapshot={snapshot} />;
}
