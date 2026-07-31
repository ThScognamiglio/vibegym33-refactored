const fs = require('fs');

const files = [
  'c:/Users/web/Desktop/vibegym33-refactored/src/features/dashboard-client/ClientHome.tsx',
  'c:/Users/web/Desktop/vibegym33-refactored/src/features/dashboard-pt/PTDashboard.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Ensure createPortal is imported
  if (!content.includes('createPortal')) {
    content = content.replace(/import\s*React\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]react['"];?/, match => {
      return match + "\nimport { createPortal } from 'react-dom';";
    });
    // Fallback if the above regex fails
    if (!content.includes('createPortal')) {
      content = "import { createPortal } from 'react-dom';\n" + content;
    }
  }

  // First, let's fix the structure of the modals.
  // We need to find:
  // <AnimatePresence>{showInfo && (
  //   <div className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
  //     <motion.div ... className="glass-panel ... ">
  //
  // And replace it with:
  // {typeof window !== 'undefined' && createPortal(
  //   <AnimatePresence>{showInfo && (
  //     <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
  //       <motion.div ... className="glass-panel w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl p-6 shadow-2xl">

  // We'll do this line by line because of nested braces
  let lines = content.split('\n');
  let newLines = [];
  let inModal = false;
  let braces = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.includes('<AnimatePresence>{showInfo && (')) {
      inModal = true;
      newLines.push("      {typeof window !== 'undefined' && createPortal(");
      newLines.push(line);
      continue;
    }

    if (inModal) {
      if (line.includes('<div className="fixed inset-0') || line.includes('<div className="fixed inset-0 z-50')) {
        line = line.replace('<div', '<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}');
        // If the z-index is z-50, make it z-[100] to ensure it's on top of everything
        line = line.replace('z-50', 'z-[100]');
        newLines.push(line);
        continue;
      }
      
      if (line.includes('className="glass-panel') || line.includes('className="bg-white')) {
        // Add max-h-[85vh] overflow-y-auto if missing
        if (!line.includes('max-h-')) {
          line = line.replace('rounded-3xl', 'max-h-[85vh] overflow-y-auto rounded-3xl');
        }
      }

      // Close the motion.div instead of div
      // We look for the closing div of the backdrop. 
      // It's right before `      )}` and `      </AnimatePresence>`
      if (line.trim() === '</AnimatePresence>') {
        // the previous line was `      )}`, and the one before should be `</div>`.
        // Let's modify the last few lines in newLines to be `</motion.div>`
        for (let j = newLines.length - 1; j >= 0; j--) {
          if (newLines[j].trim() === '</div>') {
            newLines[j] = newLines[j].replace('</div>', '</motion.div>');
            break;
          }
        }
        newLines.push(line);
        newLines.push('      ), document.body)}');
        inModal = false;
        continue;
      }
    }

    newLines.push(line);
  }

  // Also fix ConsistencyHeatmap's modal if it was different
  // (In PTDashboard it might not have been caught if it didn't use <AnimatePresence>{showInfo && (...)
  // Wait, my previous script DID wrap them all.

  fs.writeFileSync(file, newLines.join('\n'), 'utf8');
  console.log(`Updated ${file} with portals and scrollable modals.`);
}
