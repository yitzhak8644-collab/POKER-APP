# פוקר טראקר

PWA בעברית (RTL) לערב פוקר ביתי שבועי: רישום Buy-in / Rebuy / Cash-out בזמן אמת בין כמה משתמשים, בדיקת מאזן אפס-סכום, דמי כניסה 10 ₪ לשחקן, מינימום העברות בין השחקנים, והודעת סיכום לוואטסאפ.

Vite + React 18 + TypeScript + Tailwind · Supabase (Postgres, Auth עם Google, Realtime) · Vercel.

## כללי הכסף

- **מאזן פוקר** = Cash-out − (Buy-in + Rebuy). סכום המאזנים חייב להיות בדיוק 0, ואחרת מוצג באנר אדום מיד.
- **דמי כניסה: 10 ₪ לכל שחקן.**
  - יש מארח: אורח משלם 5 ₪ לקופה הקבוצתית (PayBox) ו-5 ₪ למארח. **כל מארח (גם השני) משלם רק 5 ₪ לקופה.** המארח מקבל 5 ₪ × מספר האורחים.
  - **אין מארח** (מקום ניטרלי): כולם משלמים 10 ₪ וכל הסכום (10 × מספר השחקנים) הולך לקופה. אין דמי אירוח.
- **חשבון סופי** = מאזן פוקר − דמי כניסה (10 ₪, או 5 ₪ למארח) (+ תשלום אירוח למארח). סכום החשבונות הוא `−קופה קבוצתית`, ולכן הקופה משתתפת בהסדר כנושה וירטואלי.
- **סגירת משחק**: רק מנהל השולחן, אחרי אישור מפורש, ורק כשהמאזן מתאפס ולכל שחקן יש Cash-out. הכלל נאכף גם בשרת (`close_game`).
- **צ'יפים**: אדום 5, ירוק 10, כחול 25, שחור 100, צהוב 250 (ערכי הצ'יפ). **10 צ'יפים = 1 ₪**, ולכן כל ריבאי הוא 250 צ'יפים = **25 ₪**. הוא מורכב מאדום, ירוק וכחול בלבד: **10 אדומים + 10 ירוקים + 4 כחולים**, והאפליקציה מציגה את זה בעת Buy-in / Rebuy של 25 ₪. בסיום המשחק אפשר לספור את הצ'יפים של כל שחקן לפי צבע והסכום בשקלים נחשב לבד (מעוגל לשקל; ההרכב נשמר ביומן), או להקליד סכום ישירות. ההגדרות ב-`src/lib/chips.ts`.
- **כיסאות**: בלשונית "כיסאות" רואים את השולחן מלמעלה, בצורת השולחן האמיתי: אצטדיון ארוך עם 4 כיסאות בכל צלע ארוכה וכיסא אחד בכל קצה (10 כיסאות). על השולחן מצוירים ארבעת האסים בשני הקצוות וחמשת מקומות הקלפים: פלופ של שלושה, ואחריו טרן וריבר. שחקן בוחר כיסא פנוי בלחיצה אחת ויכול לעבור או לפנות. מנהל השולחן מושיב כל שחקן, כולל שחקנים בלי חשבון. כיסא אחד לשחקן, שחקן אחד לכיסא, והבחירה מתעדכנת אצל כולם בזמן אמת. אחרי סגירת המשחק הכיסאות נעולים.
- **Buy-in ו-Rebuy**: אפשרות אחת בלבד לכל אחד, 25 ₪ (250 צ'יפים). אין סכום אחר, והאפליקציה מציגה אילו צ'יפים לקחת.
- **Cash-out ידני**: מקלידים את מספר **הצ'יפים** שנספרו והאפליקציה מחשבת שקלים (600 צ'יפים = 60 ₪).

כל הכסף הוא מספרים שלמים בש"ח.

## מבנה

```
src/lib/finance/        מנוע הכספים: פונקציות טהורות, כיסוי טסטים 100%
src/features/games/     גישה ל-Supabase, מיפוי שורות למנוע, סנכרון Realtime
src/features/game/      מסכי המשחק (שולחן, יומן, הגדרות, סיום)
supabase/migrations/    סכמה, RLS, RPCs, Realtime
supabase/tests/         טסטי SQL על Postgres מקומי
```

## התקנה והפעלה

```bash
npm install
cp .env.example .env.local   # ממלאים URL ו-anon key של פרויקט ה-Supabase
npm run dev
```

### Supabase

הפרויקט **`poker-tracker`** כבר הוקם (`cbhsynqbxurdqqtzicqw`, אזור eu-central-1) והמיגרציות `0001_init` ו-`0002_seats` הוחלו עליו. הערכים הציבוריים ל-`.env.local` וגם ל-Vercel:

- `VITE_SUPABASE_URL` = `https://cbhsynqbxurdqqtzicqw.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = ה-publishable key של הפרויקט (Project Settings → API; מתחיל ב-`sb_publishable_`). מפתח זה נועד להיות גלוי באפליקציה. **לעולם לא** לשים בקוד או ב-Vercel את ה-`service_role`, את סיסמת מסד הנתונים או את ה-Client Secret של Google.

שני צעדים שנשארו ידניים (אי אפשר לבצע אותם מחוץ לדשבורד):

1. **כניסה עם Google.** ב-Google Cloud Console יוצרים OAuth client מסוג Web ומוסיפים ל-Authorized redirect URIs את `https://cbhsynqbxurdqqtzicqw.supabase.co/auth/v1/callback`. אחר כך ב-Supabase: Authentication → Providers → Google, מפעילים ומזינים Client ID ו-Client Secret.
2. **כתובות האפליקציה.** ב-Supabase: Authentication → URL Configuration, קובעים Site URL ל-https של האתר ב-Vercel, ומוסיפים ל-Redirect URLs גם אותו וגם `http://localhost:5173`.

**למה יש `.github/workflows/keepalive.yml`:** פרויקט חינמי של Supabase מושהה אחרי כשבוע בלי פעילות, והמשחק שבועי. ה-workflow שולח בקשה קלה פעמיים בשבוע כדי שהפרויקט לא יושהה בין משחקים.

להקמה מחדש בפרויקט אחר: מריצים את כל הקבצים ב-`supabase/migrations/` לפי הסדר (`0001_init.sql` ואחריו `0002_seats.sql`) ב-SQL Editor, או `supabase db push`.

### קישור לקבוצת PayBox

האפליקציה מקשרת לקבוצת **ועד P שלוחות** (קישור ההצטרפות הציבורי מובנה בקוד, `src/lib/paybox.ts`). הקישור מופיע בדף הבית, בראש המשחק ובמסך הסיום, ליד הקופה הקבוצתית. אין צורך להגדיר כלום. כדי לכוון לקבוצה אחרת: `VITE_PAYBOX_URL` (https בלבד; ערך לא תקין מתעלמים ממנו וחוזרים לברירת המחדל) ו-`VITE_PAYBOX_GROUP_NAME`. הקישור אינו ניתן לעריכה מתוך האפליקציה, כדי שאף חבר לא יוכל להחליף את הקישור שאליו כולם נכנסים ומשלמים.

### פריסה ל-Vercel

מחברים את ה-repo, מגדירים `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` , והפריסה מזהה Vite אוטומטית. `vercel.json` מגדיר rewrite ל-SPA ו-headers ל-service worker.

## בדיקות

```bash
npm run lint && npm run typecheck
npm run test:coverage   # Vitest; סף 100% על src/lib/finance
npm run test:sql        # מיגרציה + RLS + RPCs על Postgres מקומי (לא נוגע בפרויקט Supabase אמיתי)
npm run build
```

`test:sql` דורש שרת PostgreSQL מקומי. הוא יוצר מסד נתונים זמני, מדמה את תפקידי Supabase (`anon`, `authenticated`) ו-`auth.uid()`, ומריץ את הטסטים, כולל בדיקת race בין שתי sessions (קניה מאוחרת מול סגירת משחק).

## אבטחה בקצרה

- RLS בכל הטבלאות, `anon` ללא גישה. הרשאות מינימליות ברמת עמודה.
- כתיבות רגישות הן RPC (`create_game`, `join_game`, `set_player_role`, `set_player_seat`, `void_transaction`, `close_game`) עם `search_path` ריק.
- הספר (`transactions`) הוא append-only: תיקון = ביטול והזנה מחדש. משחק סגור נעול לכתיבה, גם מול race.
- `profiles` נקראים רק ע"י הבעלים; שמות ואווטארים של שחקנים נשמרים ב-`game_players`.
- Realtime: אירועי DELETE לא ניתנים לסינון ו-RLS לא חל עליהם, לכן מחיקות של `game_players` מטופלות בלקוח לפי `id` בלבד.
