/**
 * Bulk item upload: the Excel can list the SAME item on several rows (one row per department).
 * Rows are grouped by item code, so an item is created/updated once and mapped to EVERY department
 * it appears under. Department cell can also hold several names ("A, B") or ALL / COMMON.
 */
export interface ItemGroup {
  code: string;
  name: string;
  category: string | null;
  unit: string;
  /** department names exactly as written in the file */
  departments: string[];
  /** department cell said ALL / COMMON: map to every active department */
  all: boolean;
  /** rows disagreed on the name (the most common one was used) */
  renamed: boolean;
  /** position of the item among the rows of each department, in file order (key = department name, lower case) */
  seq: Record<string, number>;
  /** position of the row when the department cell said ALL / COMMON */
  allSeq: number | null;
}

const ALL_WORDS = new Set(["all", "common", "all departments"]);

/** Most frequent value; on a tie the first one that appeared wins. */
function mode(values: string[]): string {
  const count = new Map<string, number>();
  values.forEach((v) => count.set(v, (count.get(v) ?? 0) + 1));
  let best = "";
  let bestN = 0;
  count.forEach((n, v) => {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  });
  return best;
}

export function groupUploadRows(rows: Record<string, unknown>[], units: string[]) {
  const unitMap = new Map(units.map((u) => [u.toLowerCase(), u]));
  const raw = new Map<string, { names: string[]; cats: string[]; units: string[]; depts: Set<string>; all: boolean; seq: Map<string, number>; allSeq: number | null }>();
  const deptCounter = new Map<string, number>();
  let rowNo = 0;
  const errors: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const code = String(row.item_code ?? "").trim().toUpperCase();
    const name = String(row.item_name ?? "").trim();
    const rawUnit = String(row.unit ?? "").trim();
    if (!code || !name || !rawUnit) {
      skipped++;
      errors.push(`Row skipped (missing fields): ${JSON.stringify(row)}`);
      continue;
    }
    const unit = unitMap.get(rawUnit.toLowerCase());
    if (!unit) {
      skipped++;
      errors.push(`${code}: unit "${rawUnit}" not recognized. Valid units: ${units.join(", ")}`);
      continue;
    }
    rowNo++;
    const g = raw.get(code) ?? { names: [], cats: [], units: [], depts: new Set<string>(), all: false, seq: new Map<string, number>(), allSeq: null };
    g.names.push(name);
    g.units.push(unit);
    const cat = String(row.category ?? "").trim();
    if (cat) g.cats.push(cat);
    for (const part of String(row.department ?? "").split(/[,;|\n]/)) {
      const d = part.trim();
      if (!d) continue;
      if (ALL_WORDS.has(d.toLowerCase())) {
        g.all = true;
        if (g.allSeq === null) g.allSeq = rowNo;
      } else {
        g.depts.add(d);
        const key = d.toLowerCase();
        if (!g.seq.has(key)) {
          const n = (deptCounter.get(key) ?? 0) + 1; // 1, 2, 3 ... in the order of the file
          deptCounter.set(key, n);
          g.seq.set(key, n);
        }
      }
    }
    raw.set(code, g);
  }

  const groups: ItemGroup[] = [];
  raw.forEach((g, code) => {
    groups.push({
      code,
      name: mode(g.names),
      category: g.cats.length ? mode(g.cats) : null,
      unit: mode(g.units),
      departments: Array.from(g.depts),
      all: g.all,
      renamed: new Set(g.names.map((n) => n.toLowerCase())).size > 1,
      seq: Object.fromEntries(g.seq),
      allSeq: g.allSeq,
    });
  });
  return { groups, skipped, errors };
}
