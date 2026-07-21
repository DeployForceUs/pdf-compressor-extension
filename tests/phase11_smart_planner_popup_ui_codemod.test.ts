import assert from "node:assert/strict";
import test from "node:test";
import { patchPopupSource } from "../scripts/apply-smart-planner-popup-ui.mjs";

const fixture = `import { LanguageSwitcher } from "../../components/LanguageSwitcher";

function Popup() {
  const pdf = { selected: true, recordId: "selected-pdf" };
  const officeHealth = null;

  return (
    <main>
      <div className="metadata-card" />

      <article className={officeHealth ? "office-card office-card--ready" : "office-card"}>
        Office
      </article>
    </main>
  );
}
`;

test("places the Planner card before Office Engine without changing Office markup", () => {
  const patched = patchPopupSource(fixture);

  assert.match(patched, /SmartPlannerPreparationCard/);
  assert.match(patched, /pdfReady=\{Boolean\(pdf\.selected\)\}/);
  assert.match(patched, /officeAvailable=\{Boolean\(officeHealth\)\}/);
  assert.ok(patched.indexOf("<SmartPlannerPreparationCard") < patched.indexOf("<article className={officeHealth"));
  assert.match(patched, />\n        Office\n      <\/article>/);
});

test("is idempotent", () => {
  const once = patchPopupSource(fixture);
  assert.equal(patchPopupSource(once), once);
});
