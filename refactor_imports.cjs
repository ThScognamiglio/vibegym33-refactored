const fs = require('fs');
const path = require('path');

const repoMappings = {
    // AuthRepository
    signIn: 'AuthRepository',
    signUp: 'AuthRepository',
    logout: 'AuthRepository',
    resetPassword: 'AuthRepository',
    onAuthStateChanged: 'AuthRepository',
    updateProfile: 'AuthRepository',
    deleteAuthAccount: 'AuthRepository',

    // LogsRepository
    logSet: 'LogsRepository',
    deleteLog: 'LogsRepository',
    updateLog: 'LogsRepository',
    getAllLogsForClient: 'LogsRepository',
    getSessionLogs: 'LogsRepository',
    getWorkoutTodayLogs: 'LogsRepository',
    getLastPerformance: 'LogsRepository',
    archiveOldLogs: 'LogsRepository',

    // WorkoutsRepository
    getWorkout: 'WorkoutsRepository',
    getActivePlan: 'WorkoutsRepository',
    getWorkoutsForClient: 'WorkoutsRepository',
    getPlanItems: 'WorkoutsRepository',
    createWorkout: 'WorkoutsRepository',
    updateWorkoutPlan: 'WorkoutsRepository',
    deleteWorkout: 'WorkoutsRepository',

    // UsersRepository
    getAllPTs: 'UsersRepository',
    toggleUserStatus: 'UsersRepository',
    linkClientToPT: 'UsersRepository',
    unlinkClientFromPT: 'UsersRepository',
    getClientsForPT: 'UsersRepository',
    getExercises: 'UsersRepository',
    createExercise: 'UsersRepository',
    updateExercise: 'UsersRepository',
    deleteExercise: 'UsersRepository',
    addMeasurement: 'UsersRepository',
    getMeasurements: 'UsersRepository',
    getClientExerciseSummaries: 'UsersRepository',
    getClientPlanSummary: 'UsersRepository',
    exportClientData: 'UsersRepository',
    deleteAccountData: 'UsersRepository',

    // SessionsRepository
    saveSessionSummary: 'SessionsRepository',
    getTodaySessions: 'SessionsRepository',
    getAllSessionsForClient: 'SessionsRepository',
    cleanupTodaySession: 'SessionsRepository'
};

const componentsDir = path.join(__dirname, 'src', 'components');

function refactorFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let original = content;

    if (!content.includes('api.')) return;

    // Track which repos are used
    let usedRepos = new Set();

    // Replace api.method( with Repository.method(
    content = content.replace(/api\.(\w+)\(/g, (match, method) => {
        const repo = repoMappings[method];
        if (repo) {
            usedRepos.add(repo);
            return `${repo}.${method}(`;
        }
        return match; // If not found, keep it (e.g. api.qrserver.com)
    });

    // Handle api.method without parens (e.g. in promise chains if any)
    content = content.replace(/api\.(\w+)/g, (match, method) => {
        const repo = repoMappings[method];
        if (repo) {
            usedRepos.add(repo);
            return `${repo}.${method}`;
        }
        return match;
    });

    if (usedRepos.size > 0 && content !== original) {
        // Fix imports
        content = content.replace(/import\s*\{\s*api\s*\}\s*from\s*['"]\.\.\/services\/firebase['"];?/g, '');
        
        // Add new imports right below other imports (find the last import)
        const reposImport = `import { ${Array.from(usedRepos).join(', ')} } from '../repositories';`;
        const lastImportIndex = content.lastIndexOf('import ');
        if (lastImportIndex !== -1) {
            const endOfLastImport = content.indexOf('\n', lastImportIndex);
            content = content.slice(0, endOfLastImport + 1) + reposImport + '\n' + content.slice(endOfLastImport + 1);
        } else {
            content = reposImport + '\n' + content;
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`Refactored: ${path.basename(filePath)}`);
    }
}

fs.readdirSync(componentsDir).forEach(file => {
    if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        refactorFile(path.join(componentsDir, file));
    }
});

// Also check App.tsx or similar main files if needed
const appFile = path.join(__dirname, 'src', 'App.tsx');
if (fs.existsSync(appFile)) {
    refactorFile(appFile);
}
