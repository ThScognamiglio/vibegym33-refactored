const fs = require('fs');
const file = 'c:/Users/web/Desktop/vibegym33-refactored/src/features/dashboard-pt/PTDashboard.tsx';
let c = fs.readFileSync(file, 'utf8');

const regex = /useEffect\(\(\) => \{\r?\n\s*refreshData\(\);\r?\n\s*\}, \[user\]\);/;
const replacement = `  useEffect(() => {
    refreshData();
    // AUTOMATIC TEST INJECTION
    const injectData = async () => {
      const allEx = await UsersRepository.getExercises(user.uid);
      if (!allEx.find(e => e.name === "TEST Pistol Squat")) {
        await UsersRepository.createExercise(user.uid, {
          name: "TEST Pistol Squat",
          groupId: "gambe",
          description: "Test generato automaticamente",
          equipment: Equipment.BODYWEIGHT,
          level: "advanced",
          measurement: "reps",
          videoUrl: "",
          nscaCategory: null,
          isUnilateral: true
        });
        refreshData();
      }
    };
    injectData();
  }, [user]);`;

c = c.replace(regex, replacement);
fs.writeFileSync(file, c);
console.log('Injected');
