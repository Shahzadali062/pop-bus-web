const fs = require("fs");

const file = "src/features/driverTracking/pages/DriverTrackingPage.tsx";
let c = fs.readFileSync(file, "utf8");

const viewMapButton = `          <button
            className="driver-map-button"
            onClick={() => navigate("/map")}
          >
            <Map size={19} />
            View Online Students
            <Navigation size={17} />
          </button>`;

const staticButton = `          <button
            className="driver-map-button driver-static-location-button"
            onClick={() => navigate("/static-location")}
          >
            <Map size={19} />
            Select a Static Location
            <Navigation size={17} />
          </button>`;

if (!c.includes('navigate("/static-location")')) {
  c = c.replace(viewMapButton, `${viewMapButton}

${staticButton}`);
}

fs.writeFileSync(file, c, "utf8");
console.log("Static location button added to driver page.");
