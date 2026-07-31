const fs = require('fs');
const file = 'c:/Users/web/Desktop/vibegym33-refactored/src/features/dashboard-pt/PTDashboard.tsx';
let c = fs.readFileSync(file, 'utf8');

const regex = /\/\/\s*1\.\s*First\s*add\s*volumes\s*from\s*official\s*sessions[\s\S]*?\/\/\s*2\.\s*Fallback\s*to\s*raw\s*logs\s*ONLY\s*for\s*dates\s*without\s*official\s*sessions\r?\n\s*logs\.forEach\(l\s*=>\s*\{\r?\n\s*const\s*date\s*=\s*getLocalDatePart\(l\.date\);\r?\n\s*if\s*\(!date\s*\|\|\s*sessionDates\.has\(date\)\)\s*return;/;

const replacement = `// Calculate volume entirely dynamically using logs
      logs.forEach(l => {
        const date = getLocalDatePart(l.date);
        if (!date) return;`;

c = c.replace(regex, replacement);

const regex2 = /const sessionDates = new Set<string>\(\);\r?\n\s*sessions\.forEach\(s => \{\r?\n\s*const dateKey = getLocalDatePart\(s\.date\);\r?\n\s*if \(!dateKey\) return;\r?\n\s*if \(!dailyVol\[dateKey\]\) dailyVol\[dateKey\] = 0;\r?\n\s*dailyVol\[dateKey\] \+= s\.volume;\r?\n\s*sessionDates\.add\(dateKey\);\r?\n\s*\}\);/;
c = c.replace(regex2, '');

fs.writeFileSync(file, c);
console.log('Fixed PTDashboard syntax correctly');
