const fs = require("fs");

const file = "src/features/liveMap/pages/LiveMapPage.tsx";
let c = fs.readFileSync(file, "utf8");

if (!c.includes("refreshOwnSharedStudentId")) {
  const effect = `
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
  }, []);

`;

  c = c.replace(
    /  useEffect\(\(\) => \{\r?\n    chatEndRef\.current\?\.scrollIntoView\(\{/,
    effect + `  useEffect(() => {
    chatEndRef.current?.scrollIntoView({`
  );
}

fs.writeFileSync(file, c, "utf8");
console.log("Own shared student refresh effect added.");
