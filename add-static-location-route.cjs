const fs = require("fs");

const file = "src/app/AppRouter.tsx";
let c = fs.readFileSync(file, "utf8");

if (!c.includes("StaticLocationPage")) {
  c = c.replace(
    'import LiveMapPage from "../features/liveMap/pages/LiveMapPage";',
    'import LiveMapPage from "../features/liveMap/pages/LiveMapPage";\nimport StaticLocationPage from "../features/staticLocation/pages/StaticLocationPage";'
  );
}

if (!c.includes('path="/static-location"')) {
  c = c.replace(
`        <Route
          path="/map"
          element={<LiveMapPage />}
        />`,
`        <Route
          path="/map"
          element={<LiveMapPage />}
        />

        <Route
          path="/static-location"
          element={<StaticLocationPage />}
        />`
  );
}

fs.writeFileSync(file, c, "utf8");
console.log("Static location route added.");
