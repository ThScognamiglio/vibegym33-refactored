const fs = require('fs');
const file = 'c:/Users/web/Desktop/vibegym33-refactored/src/features/dashboard-client/ClientHome.tsx';
let c = fs.readFileSync(file, 'utf8');

const regex = /const ConsistencyHeatmap: React\.FC<\{ logs: Log\[\], sessions: WorkoutSession\[\], exercises: Record<string, Exercise>, user: User \}> = \(\{ logs, sessions, exercises, user \}\) => \{\r?\n\s*const currentDayIndex = today\.getDay\(\) === 0 \? 6 : today\.getDay\(\) - 1;/;

const replacement = `const ConsistencyHeatmap: React.FC<{ logs: Log[], sessions: WorkoutSession[], exercises: Record<string, Exercise>, user: User }> = ({ logs, sessions, exercises, user }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const { days, maxVolume } = useMemo(() => {
    const today = new Date();
    const logsByDate: Record<string, number> = {};
    const handledDates = new Set<string>();

    sessions.forEach(s => {
      const ds = getLocalDatePart(s.date);
      if (!ds) return;
      handledDates.add(ds);
    });

    logs.forEach(l => {
      const dateStr = getLocalDatePart(l.date);
      if (!dateStr || l.id?.startsWith('temp_')) return;
      if (l.completed === false) return;

      const ex = exercises[l.exerciseId] || { isBodyweight: false, isUnilateral: false };
      const domainLog = new DomainLog(l);
      const logBw = resolveBodyweight(l.bodyweightAtLog, user.weight);
      const logVol = domainLog.calculateVolume(ex, logBw);
      logsByDate[dateStr] = (logsByDate[dateStr] || 0) + logVol;
      handledDates.add(dateStr);
    });

    let maxV = 1;
    Object.values(logsByDate).forEach(v => { if (v > maxV) maxV = v; });

    const currentDayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;`;

if (regex.test(c)) {
  c = c.replace(regex, replacement);
  fs.writeFileSync(file, c);
  console.log('Fixed correctly via regex');
} else {
  console.log('Regex did NOT match!');
}
