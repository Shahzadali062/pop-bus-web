const fs = require("fs");

const file = "src/features/liveMap/pages/LiveMapPage.tsx";
let c = fs.readFileSync(file, "utf8");

// Add helper to read this device/browser own sharing ID from persisted Zustand store
if (!c.includes("function getOwnSharedStudentIdFromStorage")) {
  c = c.replace(
    /export default function LiveMapPage\(\) \{/,
`function getOwnSharedStudentIdFromStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawStore = window.localStorage.getItem("pop-bus-web-driver");

    if (!rawStore) {
      return null;
    }

    const parsedStore = JSON.parse(rawStore);
    const state = parsedStore?.state ?? parsedStore;

    if (!state?.isSharing) {
      return null;
    }

    const busId =
      typeof state?.busId === "string"
        ? state.busId.trim().toUpperCase()
        : "";

    return busId || null;
  } catch {
    return null;
  }
}

export default function LiveMapPage() {`
  );
}

// Add ownSharedStudentId state
if (!c.includes("ownSharedStudentId")) {
  c = c.replace(
    `  const [aiTyping, setAiTyping] = useState(false);`,
    `  const [aiTyping, setAiTyping] = useState(false);
  const [ownSharedStudentId, setOwnSharedStudentId] =
    useState<string | null>(() => getOwnSharedStudentIdFromStorage());`
  );
}

// Add effect to refresh own sharing ID when user changes tab/page
if (!c.includes("refreshOwnSharedStudentId")) {
  c = c.replace(
    `  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);`,
    `  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshOwnSharedStudentId = () => {
      setOwnSharedStudentId(getOwnSharedStudentIdFromStorage());
    };

    refreshOwnSharedStudentId();

    window.addEventListener("focus", refreshOwnSharedStudentId);
    window.addEventListener("storage", refreshOwnSharedStudentId);
    document.addEventListener("visibilitychange", refreshOwnSharedStudentId);

    return () => {
      window.removeEventListener("focus", refreshOwnSharedStudentId);
      window.removeEventListener("storage", refreshOwnSharedStudentId);
      document.removeEventListener("visibilitychange", refreshOwnSharedStudentId);
    };
  }, []);`
  );
}

// Replace wrong auto-follow-first-student logic with own-user-first logic
c = c.replace(
`  // AUTO_FOLLOW_SELECTED_OR_FIRST_STUDENT
  useEffect(() => {
    const map = mapRef.current;

    if (!map || cameraMode === "free") {
      return;
    }

    const allStudents = Object.values(buses).filter((student) =>
      Number.isFinite(student.longitude) &&
      Number.isFinite(student.latitude)
    );

    if (allStudents.length === 0) {
      return;
    }

    const selectedStudent =
      selectedStudentId
        ? allStudents.find(
            (student) =>
              student.busId.trim().toUpperCase() === selectedStudentId
          )
        : null;

    const targetStudent = selectedStudent ?? allStudents[0];

    map.easeTo({
      center: [targetStudent.longitude, targetStudent.latitude],
      zoom: LIVE_CAMERA.zoom,
      pitch: LIVE_CAMERA.pitch,
      bearing: LIVE_CAMERA.bearing,
      duration: 900,
      essential: true,
    });
  }, [buses, cameraMode, selectedStudentId]);`,
`  // AUTO_FOLLOW_OWN_STUDENT_OR_MANUAL_SELECTION
  useEffect(() => {
    const map = mapRef.current;

    if (!map || cameraMode === "free") {
      return;
    }

    const allStudents = Object.values(buses).filter((student) =>
      Number.isFinite(student.longitude) &&
      Number.isFinite(student.latitude)
    );

    if (allStudents.length === 0) {
      return;
    }

    const selectedStudent =
      selectedStudentId
        ? allStudents.find(
            (student) =>
              student.busId.trim().toUpperCase() === selectedStudentId
          )
        : null;

    const ownStudent =
      ownSharedStudentId
        ? allStudents.find(
            (student) =>
              student.busId.trim().toUpperCase() === ownSharedStudentId
          )
        : null;

    const targetStudent = selectedStudent ?? ownStudent;

    if (!targetStudent) {
      return;
    }

    map.easeTo({
      center: [targetStudent.longitude, targetStudent.latitude],
      zoom: LIVE_CAMERA.zoom,
      pitch: LIVE_CAMERA.pitch,
      bearing: LIVE_CAMERA.bearing,
      duration: 900,
      essential: true,
    });
  }, [buses, cameraMode, selectedStudentId, ownSharedStudentId]);`
);

fs.writeFileSync(file, c, "utf8");
console.log("Map auto focus now uses own shared student only, not first random student.");
