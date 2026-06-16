const fs = require("fs");

const file = "src/features/liveMap/pages/LiveMapPage.tsx";
let c = fs.readFileSync(file, "utf8");

// Add useNavigate import
if (!c.includes("useNavigate")) {
  if (c.includes('from "react-router-dom";')) {
    c = c.replace(
      /import\s*\{([^}]+)\}\s*from "react-router-dom";/,
      (match, imports) => {
        const list = imports.split(",").map((x) => x.trim()).filter(Boolean);
        if (!list.includes("useNavigate")) list.push("useNavigate");
        return `import { ${list.join(", ")} } from "react-router-dom";`;
      }
    );
  } else {
    c = `import { useNavigate } from "react-router-dom";\n${c}`;
  }
}

// Add navigate hook inside component
if (!c.includes("const navigate = useNavigate();")) {
  c = c.replace(
    /export default function LiveMapPage\(\)\s*\{/,
    `export default function LiveMapPage() {\n  const navigate = useNavigate();`
  );
}

// Add back button inside map page root
if (!c.includes("map-back-button")) {
  c = c.replace(
    /(<(?:main|section|div)\s+className="map-page"[^>]*>)/,
    `$1
      <button
        type="button"
        className="map-back-button"
        onClick={() => navigate(-1)}
        aria-label="Go back"
        title="Go back"
      >
        <span aria-hidden="true">←</span>
      </button>`
  );
}

// Replace broken empty-state text when no active students
c = c.replace(
  /(\{busList\.length\s*===\s*0\s*\?\s*\(\s*<div[^>]*>)[\s\S]*?(<\/div>\s*\)\s*:\s*\()/,
  `$1
                    <div className="bus-empty-icon" aria-hidden="true">0</div>
                    <strong>No active students</strong>
                    <p>No student is sharing location right now.</p>
                  $2`
);

fs.writeFileSync(file, c, "utf8");
console.log("Map empty-state text and back button patched.");
