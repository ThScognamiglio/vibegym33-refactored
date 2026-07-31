const fs = require('fs');

const path = 'c:/Users/web/Desktop/prova-per-antigravity-main/services/firebase.ts';
let code = fs.readFileSync(path, 'utf8');

const getDocsSafeFn = `
const getDocsSafe = async (q: any) => {
    try {
        return await getDocs(q);
    } catch (e: any) {
        if (e.code === 'permission-denied' || !navigator.onLine || e.message?.includes('AppCheck') || e.code === 'failed-precondition') {
            console.warn("Network/AppCheck failed. Using Cache for getDocs:", q);
            return await getDocsFromCache(q);
        }
        throw e;
    }
};
`;

if (!code.includes('const getDocsSafe')) {
    code = code.replace(/const realApi = \{/, getDocsSafeFn + '\nconst realApi = {');
}

// Replace getDocs( with getDocsSafe( EXCEPT in the import
code = code.replace(/await getDocs\(/g, 'await getDocsSafe(');

// But we need to make sure the one inside getDocsSafe(q) is reverted to getDocs
code = code.replace(/await getDocsSafe\(q\);\n    \} catch/g, 'await getDocs(q);\n    } catch');

fs.writeFileSync(path, code);
console.log("firebase.ts patched with getDocsSafe.");
