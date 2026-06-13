type CharacterDebugValues = {
  markerWidth: number;
  markerHeight: number;
  modelWidth: number;
  modelHeight: number;
  moveUpDown: number;
  labelTop: number;
  labelFontSize: number;
  modelZoom: number;
  modelPitch: number;
  modelTargetY: number;
};

const STORAGE_KEY = "popbus-glb-character-debug";

const defaultValues: CharacterDebugValues = {
  markerWidth: 220,
  markerHeight: 275,
  modelWidth: 220,
  modelHeight: 260,
  moveUpDown: -70,
  labelTop: 36,
  labelFontSize: 10,
  modelZoom: 1.55,
  modelPitch: 62,
  modelTargetY: 0.9,
};

function loadValues(): CharacterDebugValues {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return defaultValues;
    }

    return {
      ...defaultValues,
      ...JSON.parse(saved),
    };
  } catch {
    return defaultValues;
  }
}

function saveValues(values: CharacterDebugValues) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(values, null, 2)
  );
}

function applyValues(values: CharacterDebugValues) {
  const root = document.documentElement;

  root.style.setProperty("--glb-marker-width", `${values.markerWidth}px`);
  root.style.setProperty("--glb-marker-height", `${values.markerHeight}px`);
  root.style.setProperty("--glb-model-width", `${values.modelWidth}px`);
  root.style.setProperty("--glb-model-height", `${values.modelHeight}px`);
  root.style.setProperty("--glb-marker-move", `${values.moveUpDown}px`);
  root.style.setProperty("--glb-label-top", `${values.labelTop}px`);
  root.style.setProperty("--glb-label-font-size", `${values.labelFontSize}px`);

  document
    .querySelectorAll("model-viewer.glb-human-model")
    .forEach((modelViewer) => {
      modelViewer.setAttribute(
        "camera-orbit",
        `0deg ${values.modelPitch}deg ${values.modelZoom}m`
      );

      modelViewer.setAttribute(
        "camera-target",
        `0m ${values.modelTargetY}m 0m`
      );
    });
}

function createSlider(
  title: string,
  key: keyof CharacterDebugValues,
  min: number,
  max: number,
  step: number,
  values: CharacterDebugValues,
  onChange: () => void
) {
  const row = document.createElement("label");
  row.className = "character-debug-row";

  const name = document.createElement("span");
  name.textContent = title;

  const value = document.createElement("strong");
  value.textContent = String(values[key]);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(values[key]);

  input.addEventListener("input", () => {
    values[key] = Number(input.value);
    value.textContent = String(values[key]);
    saveValues(values);
    applyValues(values);
    onChange();
  });

  row.append(name, value, input);
  return row;
}

export function setupGlbCharacterDebugger() {
  if (document.getElementById("glb-character-debugger")) {
    return;
  }

  const values = loadValues();
  applyValues(values);

  const panel = document.createElement("aside");
  panel.id = "glb-character-debugger";
  panel.className = "character-debug-panel";

  const heading = document.createElement("div");
  heading.className = "character-debug-title";
  heading.innerHTML =
    "<strong>Character Debug</strong><small>Adjust GLB size live</small>";

  const output = document.createElement("textarea");
  output.className = "character-debug-output";
  output.readOnly = true;

  const updateOutput = () => {
    output.value = JSON.stringify(values, null, 2);
  };

  const controls = [
    createSlider("Marker width", "markerWidth", 80, 420, 1, values, updateOutput),
    createSlider("Marker height", "markerHeight", 100, 500, 1, values, updateOutput),
    createSlider("Model width", "modelWidth", 80, 420, 1, values, updateOutput),
    createSlider("Model height", "modelHeight", 100, 500, 1, values, updateOutput),
    createSlider("Move up/down", "moveUpDown", -220, 80, 1, values, updateOutput),
    createSlider("Label top", "labelTop", -30, 160, 1, values, updateOutput),
    createSlider("Label font", "labelFontSize", 8, 22, 1, values, updateOutput),
    createSlider("Model zoom", "modelZoom", 0.5, 4, 0.05, values, updateOutput),
    createSlider("Model pitch", "modelPitch", 20, 85, 1, values, updateOutput),
    createSlider("Target height", "modelTargetY", 0, 2, 0.05, values, updateOutput),
  ];

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy values";
  copyButton.className = "character-debug-button";

  copyButton.addEventListener("click", async () => {
    updateOutput();

    try {
      await navigator.clipboard.writeText(output.value);
      copyButton.textContent = "Copied";
      setTimeout(() => {
        copyButton.textContent = "Copy values";
      }, 1200);
    } catch {
      console.log("[GLB_CHARACTER_VALUES]", values);
    }
  });

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "Reset";
  resetButton.className = "character-debug-button secondary";

  resetButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });

  const buttons = document.createElement("div");
  buttons.className = "character-debug-buttons";
  buttons.append(copyButton, resetButton);

  panel.append(heading, ...controls, buttons, output);
  document.body.appendChild(panel);

  updateOutput();

  const observer = new MutationObserver(() => {
    applyValues(values);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
