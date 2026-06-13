const fs = require("fs");

const file = "src/features/liveMap/pages/LiveMapPage.tsx";
let code = fs.readFileSync(file, "utf8");

function removeFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start === -1) {
    console.log(`Function not found, skipped: ${functionName}`);
    return source;
  }

  const braceStart = source.indexOf("{", start);
  if (braceStart === -1) {
    console.log(`Brace not found, skipped: ${functionName}`);
    return source;
  }

  let depth = 0;

  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];

    if (char === "{") depth += 1;

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        const before = source.slice(0, start).replace(/\n{3,}$/g, "\n\n");
        const after = source.slice(i + 1).replace(/^\n{3,}/g, "\n\n");
        console.log(`Removed unused function: ${functionName}`);
        return before + after;
      }
    }
  }

  console.log(`Could not remove, skipped: ${functionName}`);
  return source;
}

/* Fix broken self-referencing LIVE_CAMERA */
const liveCameraRegex =
  /const LIVE_CAMERA(?:\s*:\s*\{[\s\S]*?\})?\s*=\s*\{[\s\S]*?\n\};/;

const fixedLiveCamera = `const LIVE_CAMERA: {
  zoom: number;
  pitch: number;
  bearing: number;
} = {
  zoom: 20.276,
  pitch: 60,
  bearing: -78.69,
};`;

if (liveCameraRegex.test(code)) {
  code = code.replace(liveCameraRegex, fixedLiveCamera);
  console.log("LIVE_CAMERA fixed.");
} else {
  console.log("LIVE_CAMERA block not found. Inserting after MAP_CENTER.");
  code = code.replace(
    /const MAP_CENTER: \[number, number\] = \[[^\]]+\];/,
    `const MAP_CENTER: [number, number] = [100.53389, 13.73604];

${fixedLiveCamera}`
  );
}

/* Remove old unused helpers causing noUnusedLocals build errors */
code = removeFunction(code, "calculateBearing");
code = removeFunction(code, "distanceInMeters");

/* Make sure no debugger import/call remains */
code = code.replace(
  /import \{ setupGlbCharacterDebugger \} from "\.\.\/debug\/glbCharacterDebugger";\r?\n/g,
  ""
);

code = code.replace(
  /\r?\n\s*setupGlbCharacterDebugger\(\);/g,
  ""
);

fs.writeFileSync(file, code, "utf8");
console.log("LiveMapPage build errors fixed.");
