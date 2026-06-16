const fs = require("fs");

const file = "src/features/liveMap/pages/LiveMapPage.tsx";
let c = fs.readFileSync(file, "utf8");

// Add ai-open class to map root so mobile CSS can hide controls when chatbot is open
c = c.replace(
  'className="map-page"',
  'className={`map-page${aiOpen ? " ai-open" : ""}`}'
);

// Replace corrupted no-students empty state
c = c.replace(
  /<div className="empty-dropdown">\s*<span className="empty-icon">[\s\S]*?<\/span>\s*<span>No active students<\/span>\s*<\/div>/,
  `<div className="empty-dropdown">
              <span className="empty-title">No active students</span>
              <span className="empty-subtitle">No student is sharing location right now.</span>
            </div>`
);

fs.writeFileSync(file, c, "utf8");
console.log("Map TSX mobile UI cleanup applied.");
