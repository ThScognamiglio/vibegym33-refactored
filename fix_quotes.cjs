const fs = require('fs');

const files = [
  'c:/Users/web/Desktop/vibegym33-refactored/src/features/dashboard-client/ClientHome.tsx',
  'c:/Users/web/Desktop/vibegym33-refactored/src/features/dashboard-pt/PTDashboard.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\\'spring\\'/g, "'spring'");
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file}`);
}
