const fs = require('fs');

const files = [
  'c:/Users/web/Desktop/vibegym33-refactored/src/features/dashboard-client/ClientHome.tsx',
  'c:/Users/web/Desktop/vibegym33-refactored/src/features/dashboard-pt/PTDashboard.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Ensure AnimatePresence is imported
  if (content.includes('framer-motion') && !content.includes('AnimatePresence')) {
    content = content.replace(/import\s*\{\s*motion\s*\}\s*from\s*['"]framer-motion['"];/, "import { motion, AnimatePresence } from 'framer-motion';");
  } else if (content.includes('framer-motion') && content.includes('AnimatePresence')) {
     // Already imported
  }

  // Standardize Info Button Triggers
  // Need to be careful with regex, we can match:
  // <button onClick={() => setShowInfo(true)} ...>
  //   <Info className="..." />
  // </button>
  content = content.replace(/<button[^>]*onClick=\{\(\)\s*=>\s*setShowInfo\(true\)\}[^>]*>\s*<Info[^>]*>\s*<\/button>/g, 
    '<button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0">\n          <Info className="w-5 h-5" />\n        </button>'
  );
  
  // also handle inline <button onClick={() => setShowInfo(true)} ...><Info ... /></button>
  content = content.replace(/<button[^>]*onClick=\{\(\)\s*=>\s*setShowInfo\(true\)\}[^>]*><Info[^>]*><\/button>/g, 
    '<button onClick={() => setShowInfo(true)} className="p-1.5 rounded-full text-gray-400 hover:text-cyan-500 bg-gray-100 dark:bg-gray-700 transition-colors shrink-0"><Info className="w-5 h-5" /></button>'
  );

  // Standardize Modal Initial/Animate/Transition
  content = content.replace(/<motion\.div\s*initial=\{\{\s*scale:\s*0\.9,\s*opacity:\s*0\s*\}\}\s*animate=\{\{\s*scale:\s*1,\s*opacity:\s*1\s*\}\}\s*(?:transition=\{\{[^}]*\}\}\s*)?className="glass-panel/g, 
    '<motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: \\\'spring\\\', duration: 0.4 }} className="glass-panel'
  );

  content = content.replace(/<motion\.div\s*initial=\{\{\s*scale:\s*0\.9,\s*opacity:\s*0\s*\}\}\s*animate=\{\{\s*scale:\s*1,\s*opacity:\s*1\s*\}\}\s*className="bg-white/g, 
    '<motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: \\\'spring\\\', duration: 0.4 }} className="bg-white'
  );

  let lines = content.split('\n');
  let newLines = [];
  let inShowInfo = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.includes('{showInfo && (')) {
      inShowInfo = true;
      newLines.push(line.replace('{showInfo && (', '<AnimatePresence>{showInfo && ('));
      continue;
    }

    if (inShowInfo && line.trim() === ')}') {
      // Find if the next line is the closing div `      )}`
      newLines.push(line);
      newLines.push('      </AnimatePresence>');
      inShowInfo = false;
      continue;
    }

    newLines.push(line);
  }

  fs.writeFileSync(file, newLines.join('\n'), 'utf8');
  console.log(`Updated ${file}`);
}
