import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-all-goal-flows.js");
const marker = "AI Lab all goal flows";

const runtime = `(() => {
  const marker = "${marker}";

  function goalPanel() {
    return document.querySelector(".ai-lab-goal-panel");
  }

  function goalButton(goal, label) {
    return '<button type="button" class="ai-lab-goal-option" data-ai-goal="' + goal + '">' + label + '</button>';
  }

  function optionButton(value, label) {
    return '<button type="button" class="ai-lab-goal-option" data-ai-option="' + value + '">' + label + '</button>';
  }

  function renderGoalChoices(panel) {
    panel.dataset.aiLabGoalView = "goals";
    panel.dataset.aiLabActiveGoal = "";
    panel.innerHTML = [
      '<p class="ai-lab-goal-panel__eyebrow">Define Goal</p>',
      '<h2 id="ai-lab-goal-title">What do you need to do with this PDF?</h2>',
      '<div class="ai-lab-goal-options">',
      goalButton("email", "Send by email"),
      goalButton("portal", "Upload to a portal"),
      goalButton("print", "Print"),
      goalButton("archive", "Archive"),
      goalButton("reduce", "Reduce file size"),
      goalButton("other", "Something else"),
      '</div>',
    ].join("");
  }

  function renderChoiceScreen(panel, config) {
    panel.dataset.aiLabGoalView = "choices";
    panel.dataset.aiLabActiveGoal = config.goal;
    panel.innerHTML = [
      '<button type="button" class="ai-lab-goal-back" aria-label="Back to goals">← Back</button>',
      '<p class="ai-lab-goal-panel__eyebrow">' + config.eyebrow + '</p>',
      '<h2 id="ai-lab-goal-title">' + config.question + '</h2>',
      '<div class="ai-lab-goal-options">',
      ...config.options.map((entry) => optionButton(entry.value, entry.label)),
      '</div>',
      config.customSize ? [
        '<div class="ai-lab-custom-size" hidden>',
        '<input class="ai-lab-custom-size__input" type="number" min="1" max="1024" step="1" inputmode="numeric" placeholder="Target size in MB">',
        '<button type="button" class="primary ai-lab-custom-size__apply" disabled>Use size</button>',
        '</div>',
      ].join("") : "",
    ].join("");
  }

  function renderEmail(panel) {
    renderChoiceScreen(panel, {
      goal: "email",
      eyebrow: "Send by email",
      question: "What size should the PDF fit?",
      customSize: true,
      options: [
        { value: "size:10", label: "10 MB" },
        { value: "size:20", label: "20 MB" },
        { value: "size:25", label: "25 MB" },
        { value: "custom-size", label: "Custom" },
      ],
    });
  }

  function renderPortal(panel) {
    renderChoiceScreen(panel, {
      goal: "portal",
      eyebrow: "Upload to a portal",
      question: "What file-size limit does the portal accept?",
      customSize: true,
      options: [
        { value: "size:10", label: "10 MB" },
        { value: "size:20", label: "20 MB" },
        { value: "size:50", label: "50 MB" },
        { value: "custom-size", label: "Custom" },
      ],
    });
  }

  function renderPrint(panel) {
    renderChoiceScreen(panel, {
      goal: "print",
      eyebrow: "Print",
      question: "What print quality do you need?",
      options: [
        { value: "print:standard", label: "Standard" },
        { value: "print:high", label: "High quality" },
      ],
    });
  }

  function renderArchive(panel) {
    renderChoiceScreen(panel, {
      goal: "archive",
      eyebrow: "Archive",
      question: "What matters most for this archive?",
      options: [
        { value: "archive:small", label: "Smaller file" },
        { value: "archive:quality", label: "Preserve quality" },
      ],
    });
  }

  function renderReduce(panel) {
    renderChoiceScreen(panel, {
      goal: "reduce",
      eyebrow: "Reduce file size",
      question: "How strongly should the PDF be compressed?",
      options: [
        { value: "reduce:light", label: "Light" },
        { value: "reduce:balanced", label: "Balanced" },
        { value: "reduce:maximum", label: "Maximum" },
      ],
    });
  }

  function renderOther(panel) {
    panel.dataset.aiLabGoalView = "other";
    panel.dataset.aiLabActiveGoal = "other";
    panel.innerHTML = [
      '<button type="button" class="ai-lab-goal-back" aria-label="Back to goals">← Back</button>',
      '<p class="ai-lab-goal-panel__eyebrow">Something else</p>',
      '<h2 id="ai-lab-goal-title">What do you need from this PDF?</h2>',
      '<div class="ai-lab-other-goal">',
      '<textarea class="ai-lab-other-goal__input" maxlength="240" placeholder="Describe the result you need"></textarea>',
      '<button type="button" class="primary ai-lab-other-goal__apply" disabled>Build plan</button>',
      '</div>',
    ].join("");
    panel.querySelector(".ai-lab-other-goal__input")?.focus();
  }

  function choiceScreenForGoal(panel, goal) {
    if (goal === "email") renderEmail(panel);
    else if (goal === "portal") renderPortal(panel);
    else if (goal === "print") renderPrint(panel);
    else if (goal === "archive") renderArchive(panel);
    else if (goal === "reduce") renderReduce(panel);
    else renderOther(panel);
  }

  function planFor(goal, option, customText = "") {
    if (goal === "email" || goal === "portal") {
      const sizeMb = Number(option.split(":")[1]);
      const lower = Math.max(1, Math.round(sizeMb * 0.8));
      const upper = Math.max(lower, Math.round(sizeMb * 0.95));
      return {
        title: goal === "email" ? "Ready for email delivery" : "Ready for portal upload",
        rows: [
          ["Target", (goal === "email" ? "Email under " : "Portal file under ") + sizeMb + " MB"],
          ["Recommended", "Balanced compression"],
          ["Estimated output", lower + "–" + upper + " MB"],
          ["Quality", "Good for screen viewing and standard printing"],
          ["Processing", "Local"],
        ],
      };
    }

    if (goal === "print") {
      const high = option === "print:high";
      return {
        title: high ? "High-quality print plan" : "Standard print plan",
        rows: [
          ["Target", high ? "High-quality printing" : "Standard office printing"],
          ["Recommended", high ? "Quality-first optimization" : "Balanced optimization"],
          ["Image detail", high ? "Preserve high-resolution images" : "Preserve readable print detail"],
          ["Quality", high ? "Maximum practical print fidelity" : "Good standard print quality"],
          ["Processing", "Local"],
        ],
      };
    }

    if (goal === "archive") {
      const preserve = option === "archive:quality";
      return {
        title: preserve ? "Quality-preserving archive plan" : "Compact archive plan",
        rows: [
          ["Target", preserve ? "Long-term archive with preserved quality" : "Smaller long-term archive"],
          ["Recommended", preserve ? "Conservative optimization" : "Balanced archival compression"],
          ["Structure", "Keep document structure intact"],
          ["Quality", preserve ? "Preserve original visual detail" : "Prioritize compact storage"],
          ["Processing", "Local"],
        ],
      };
    }

    if (goal === "reduce") {
      const mode = option.split(":")[1];
      const label = mode === "light" ? "Light compression" : mode === "maximum" ? "Maximum compression" : "Balanced compression";
      const quality = mode === "light" ? "Highest quality retention" : mode === "maximum" ? "Smallest practical file" : "Best size and quality balance";
      return {
        title: label + " plan",
        rows: [
          ["Target", "Reduce PDF file size"],
          ["Recommended", label],
          ["Priority", quality],
          ["Structure", "Preserve page order and document integrity"],
          ["Processing", "Local"],
        ],
      };
    }

    return {
      title: "Custom document plan",
      rows: [
        ["Goal", customText],
        ["Recommended", "Planner-guided optimization"],
        ["Priority", "Match the requested outcome"],
        ["Privacy", "No PDF content leaves this device"],
        ["Processing", "Local"],
      ],
    };
  }

  function renderRecommendation(panel, goal, option, customText = "") {
    const plan = planFor(goal, option, customText);
    panel.dataset.aiLabGoalView = "recommendation";
    panel.dataset.aiLabActiveGoal = goal;
    panel.dataset.aiLabSelectedOption = option;
    panel.innerHTML = [
      '<button type="button" class="ai-lab-goal-back" aria-label="Back to goal choices">← Back</button>',
      '<p class="ai-lab-goal-panel__eyebrow">Recommended Plan</p>',
      '<h2 id="ai-lab-goal-title">' + plan.title + '</h2>',
      '<div class="ai-lab-recommendation">',
      ...plan.rows.map(([label, value]) => '<span><strong>' + label + '</strong> ' + value + '</span>'),
      '</div>',
      '<button type="button" class="primary ai-lab-process-button">Process PDF</button>',
    ].join("");
  }

  function bindPanel(panel) {
    if (panel.dataset.aiLabAllGoalFlowBound === "1") return;
    panel.dataset.aiLabAllGoalFlowBound = "1";

    panel.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!target) return;

      const goal = target.getAttribute("data-ai-goal");
      if (goal) {
        choiceScreenForGoal(panel, goal);
        return;
      }

      if (target.matches(".ai-lab-goal-back")) {
        if (panel.dataset.aiLabGoalView === "recommendation") choiceScreenForGoal(panel, panel.dataset.aiLabActiveGoal || "email");
        else renderGoalChoices(panel);
        return;
      }

      const option = target.getAttribute("data-ai-option");
      if (option === "custom-size") {
        const custom = panel.querySelector(".ai-lab-custom-size");
        if (custom) custom.hidden = false;
        panel.querySelector(".ai-lab-custom-size__input")?.focus();
        return;
      }

      if (option) {
        renderRecommendation(panel, panel.dataset.aiLabActiveGoal || "email", option);
        return;
      }

      if (target.matches(".ai-lab-custom-size__apply")) {
        const input = panel.querySelector(".ai-lab-custom-size__input");
        const value = Number(input?.value);
        if (Number.isFinite(value) && value > 0) renderRecommendation(panel, panel.dataset.aiLabActiveGoal || "email", "size:" + Math.round(value));
        return;
      }

      if (target.matches(".ai-lab-other-goal__apply")) {
        const input = panel.querySelector(".ai-lab-other-goal__input");
        const value = input?.value?.trim() || "";
        if (value) renderRecommendation(panel, "other", "other:text", value);
      }
    });

    panel.addEventListener("input", (event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.matches(".ai-lab-custom-size__input")) {
        const apply = panel.querySelector(".ai-lab-custom-size__apply");
        if (apply instanceof HTMLButtonElement) apply.disabled = !(Number(input.value) > 0);
      }
      if (input instanceof HTMLTextAreaElement && input.matches(".ai-lab-other-goal__input")) {
        const apply = panel.querySelector(".ai-lab-other-goal__apply");
        if (apply instanceof HTMLButtonElement) apply.disabled = input.value.trim().length === 0;
      }
    });

    panel.addEventListener("keydown", (event) => {
      const input = event.target;
      if (event.key === "Enter" && input instanceof HTMLInputElement && input.matches(".ai-lab-custom-size__input")) {
        const value = Number(input.value);
        if (Number.isFinite(value) && value > 0) renderRecommendation(panel, panel.dataset.aiLabActiveGoal || "email", "size:" + Math.round(value));
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && input instanceof HTMLTextAreaElement && input.value.trim()) {
        renderRecommendation(panel, "other", "other:text", input.value.trim());
      }
    });
  }

  function install() {
    const panel = goalPanel();
    if (!panel) return;
    bindPanel(panel);
    const hasGoalButtons = panel.querySelector('[data-ai-goal]');
    if (!hasGoalButtons && (!panel.dataset.aiLabGoalView || panel.dataset.aiLabGoalView === "goals")) renderGoalChoices(panel);
  }

  install();
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  console.debug(marker);
})();
`;

await writeFile(RUNTIME_PATH, runtime, "utf8");

let popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
popupHtml = popupHtml.replace(/<script\b[^>]*\bsrc=["']\/ai-lab-all-goal-flows\.js["'][^>]*><\/script>/gi, "");
popupHtml = popupHtml.replace("</body>", '<script src="/ai-lab-all-goal-flows.js"></script></body>');
await writeFile(POPUP_HTML_PATH, popupHtml, "utf8");

const verified = await readFile(RUNTIME_PATH, "utf8");
for (const required of [marker, "Upload to a portal", "High quality", "Preserve quality", "Maximum", "Something else"]) {
  if (!verified.includes(required)) throw new Error(`AI Lab all-goal flow verification failed: missing ${required}`);
}

console.log("AI Lab all goal flows verified");
