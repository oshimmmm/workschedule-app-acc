import { NextResponse } from "next/server";
import db from "../../../firebase/db";
import { collection, getDocs } from "firebase/firestore";
import ExcelJS from "exceljs";

interface PositionData {
  id: string;
  name: string;
  outputCell: string;
  priority: number;
  required: boolean;
  sameStaffWeekly: boolean;
  allowMultiple: boolean;
  staffSeveral?: boolean;
  departments?: string[];
  // 休みフラグ（trueなら当日/翌日を休みとする）
  horidayToday?: boolean;
  horidayTomorrow?: boolean;
  // 依存ポジション：このポジションは、dependence に記載された独立ポジションの直近の配置結果を参照する
  dependence?: string;
}

interface StaffData {
  id: string;
  name: string;
  availablePositions: string[];
  holidaysYukyu?: string[];
  holidaysFurikyu?: string[];
  holidaysDaikyu?: string[];
  departments?: string[];
  // 特別割当用の各ポジションフィールド（例："二交代" など）
}

/** スタッフデータを動的キーで参照できるようにするための型 */
type StaffIndexable = StaffData & {
  [key: string]: unknown; // 任意のキーを許容
};

// --- 日本の祝日取得 ---
async function getJapaneseHolidays(year: number, month: number): Promise<string[]> {
  try {
    const res = await fetch("https://holidays-jp.github.io/api/v1/date.json");
    if (!res.ok) {
      console.error("祝日API取得エラー", res.statusText);
      return [];
    }
    const data: Record<string, string> = await res.json();
    const keyPrefix = `${year}-${month.toString().padStart(2, "0")}`;
    return Object.keys(data).filter((date) => date.startsWith(keyPrefix));
  } catch (error) {
    console.error("祝日API取得例外", error);
    return [];
  }
}

async function isJapaneseHoliday(date: Date): Promise<boolean> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const dateStr = formatDateLocal(date);
  const holidays = await getJapaneseHolidays(year, month);
  return holidays.includes(dateStr);
}

function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDatesInMonth(monthStr: string): Date[] {
  const [year, month] = monthStr.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const dates: Date[] = [];
  const current = new Date(firstDay);
  while (current <= lastDay) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// --- ヘルパー関数：次の平日を取得 ---
async function getNextBusinessDay(date: Date): Promise<string | null> {
  let next = new Date(date);
  let attempts = 0;
  next.setDate(next.getDate() + 1);
  while (
    (next.getDay() === 0 || next.getDay() === 6 || (await isJapaneseHoliday(next))) &&
    attempts < 10
  ) {
    next.setDate(next.getDate() + 1);
    attempts++;
  }
  return attempts < 10 ? formatDateLocal(next) : null;
}

async function getPreviousBusinessDay(date: Date): Promise<string | null> {
  let prev = new Date(date);
  let attempts = 0;
  // 昨日からさかのぼる
  prev.setDate(prev.getDate() - 1);
  while (
    (prev.getDay() === 0 || prev.getDay() === 6 || (await isJapaneseHoliday(prev))) &&
    attempts < 10
  ) {
    prev.setDate(prev.getDate() - 1);
    attempts++;
  }
  return attempts < 10 ? formatDateLocal(prev) : null;
}

// --- ヘルパー関数：候補スタッフが次の平日にも利用可能かチェック ---
// 利用不可なら、次平日の既定休みリスト（holidaysYukyu, holidaysFurikyu, holidaysDaikyu）に含まれているとみなす
async function isCandidateAvailableNextBusinessDay(
  candidate: string,
  currentDate: Date,
  filteredStaffList: StaffData[]
): Promise<boolean> {
  const nextBusinessDateStr = await getNextBusinessDay(currentDate);
  if (!nextBusinessDateStr) return false;
  const staff = filteredStaffList.find((s) => s.name === candidate);
  if (!staff) return false;
  if (staff.holidaysYukyu && staff.holidaysYukyu.includes(nextBusinessDateStr)) return false;
  if (staff.holidaysFurikyu && staff.holidaysFurikyu.includes(nextBusinessDateStr)) return false;
  if (staff.holidaysDaikyu && staff.holidaysDaikyu.includes(nextBusinessDateStr)) return false;
  // ※ 必要に応じて、グローバルな specialHolidays（次平日の情報）があれば、そちらもチェックできます
  return true;
}

export async function POST(request: Request) {
  const { month, department } = (await request.json()) as { month: string; department?: string };
  if (!month) {
    return NextResponse.json({ error: "月が指定されていません" }, { status: 400 });
  }
  const dates = getDatesInMonth(month);
  if (dates.length === 0) {
    return NextResponse.json({ error: "指定された月の日付を取得できません" }, { status: 400 });
  }

  // Firestore から取得
  const posSnapshot = await getDocs(collection(db, "positions"));
  const positions: PositionData[] = posSnapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as PositionData)
  );
  const staffSnapshot = await getDocs(collection(db, "staff"));
  const staffList: StaffData[] = staffSnapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as StaffData)
  );

  // 部門フィルター
  let filteredPositions: PositionData[] = positions;
  let filteredStaffList: StaffData[] = staffList;
  if (department && department !== "") {
    filteredPositions = positions.filter(
      (pos) => pos.departments && pos.departments.includes(department)
    );
    filteredStaffList = staffList.filter(
      (staff) => staff.departments && staff.departments.includes(department)
    );
  }

  // 優先度ソート
  filteredPositions.sort((a, b) => a.priority - b.priority);

  // 休み用ポジション（名称判定）
  const holidayPosYukyu = filteredPositions.filter((pos) =>
    pos.name.startsWith("休み(有休)")
  );
  const holidayPosFurikyu = filteredPositions.filter((pos) =>
    pos.name.startsWith("休み(振休)")
  );
  const holidayPosDaikyu = filteredPositions.filter((pos) =>
    pos.name.startsWith("休み(代休)")
  );

  // 通常ポジション（休みポジション以外）
  const normalPositions = filteredPositions.filter((pos) => !pos.name.startsWith("休み"));

  // ※ 依存される側（独立ポジション）で、他から参照されるもののIDをセット化
  const referencedIndependentIds = new Set<string>();
  for (const pos of normalPositions) {
    if (pos.dependence && pos.dependence.trim() !== "") {
      referencedIndependentIds.add(pos.dependence);
    }
  }

  // Excel ワークブック作成
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("勤務表");
  worksheet.getCell("A1").value = "日付";

  // ヘッダー出力（通常・休みポジション）
  normalPositions.forEach((pos) => {
    if (!pos.outputCell) return;
    const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    worksheet.getCell(pos.outputCell).value = pos.name;
  });
  [holidayPosYukyu, holidayPosFurikyu, holidayPosDaikyu].forEach((arr) => {
    arr.forEach((pos) => {
      if (!pos.outputCell) return;
      const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
      if (!match) return;
      worksheet.getCell(pos.outputCell).value = pos.name;
    });
  });

  // 週ごとの同一スタッフ利用管理
  let weeklyAssignments: { [weekKey: string]: string } = {};
  let prevWeeklyAssignments: { [weekKey: string]: string } = {};
  let currentWeekStart: string = "";

  // 割当結果マップ（キー：日付、値：各ポジションの割当配列）
  const staffAssignments: { [dateStr: string]: { [posId: string]: string[] } } = {};
  const staffSeveralCount: { [name: string]: number } = {};

  // 特別割当により休みとするスタッフの管理（キー：日付、値：スタッフ名の Set）
  const specialHolidays: { [dateStr: string]: Set<string> } = {};

  console.log(`[generate] dates.length = ${dates.length}`);
  console.log(`[generate] positions.length = ${filteredPositions.length}`);
  console.log(`[generate] staffList.length = ${filteredStaffList.length}`);

  // 日付ごとのループ
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = formatDateLocal(date);
    const rowIndex = i + 2;
    worksheet.getCell(`A${rowIndex}`).value = dateStr;
    const day = date.getDay();

    // 週の開始日（月曜日）算出
    const currentDate = new Date(date);
    const diffForMonday = currentDate.getDay() === 0 ? -6 : 1 - currentDate.getDay();
    const weekStartDate = new Date(currentDate);
    weekStartDate.setDate(currentDate.getDate() + diffForMonday);
    const weekStartStr = formatDateLocal(weekStartDate);
    if (weekStartStr !== currentWeekStart) {
      prevWeeklyAssignments = { ...weeklyAssignments };
      weeklyAssignments = {};
      currentWeekStart = weekStartStr;
    }

    // 既定の休み情報による休みスタッフ抽出
    const holidayStaffYukyu = filteredStaffList.filter(
      (s) =>
        s.holidaysYukyu &&
        Array.isArray(s.holidaysYukyu) &&
        s.holidaysYukyu.includes(dateStr)
    );
    const holidayStaffFurikyu = filteredStaffList.filter(
      (s) =>
        s.holidaysFurikyu &&
        Array.isArray(s.holidaysFurikyu) &&
        s.holidaysFurikyu.includes(dateStr)
    );
    const holidayStaffDaikyu = filteredStaffList.filter(
      (s) =>
        s.holidaysDaikyu &&
        Array.isArray(s.holidaysDaikyu) &&
        s.holidaysDaikyu.includes(dateStr)
    );

    // ★【特別割当処理】★
    const specialAssigned = new Set<string>();
    const specialAssignedTomorrowOnly = new Set<string>(); // 翌日のみ休みのスタッフ用
    if (!staffAssignments[dateStr]) {
      staffAssignments[dateStr] = {};
    }
    for (const pos of normalPositions) {
      if (!staffAssignments[dateStr][pos.id]) {
        staffAssignments[dateStr][pos.id] = [];
      }
      // スタッフデータは全体（staffList）からチェック
      for (const staff of staffList) {
        const staffIndexable = staff as StaffIndexable;
        const specialField = staffIndexable[pos.name] as string[] | undefined;
        if (Array.isArray(specialField) && specialField.includes(dateStr)) {
          if (specialAssigned.has(staff.name)) continue;
          if (!staffAssignments[dateStr][pos.id].includes(staff.name)) {
            staffAssignments[dateStr][pos.id].push(staff.name);
          }
          if (pos.horidayToday && pos.horidayTomorrow) {
            if (!specialHolidays[dateStr]) specialHolidays[dateStr] = new Set();
            specialHolidays[dateStr].add(staff.name);
            const nextDate = new Date(date.getTime() + 86400000);
            const nextDateStr = formatDateLocal(nextDate);
            if (!specialHolidays[nextDateStr]) specialHolidays[nextDateStr] = new Set();
            specialHolidays[nextDateStr].add(staff.name);
            specialAssigned.add(staff.name);
          } else if (pos.horidayToday) {
            if (!specialHolidays[dateStr]) specialHolidays[dateStr] = new Set();
            specialHolidays[dateStr].add(staff.name);
            specialAssigned.add(staff.name);
          } else if (!pos.horidayToday && pos.horidayTomorrow) {
            const nextDate = new Date(date.getTime() + 86400000);
            const nextDateStr = formatDateLocal(nextDate);
            if (!specialHolidays[nextDateStr]) specialHolidays[nextDateStr] = new Set();
            specialHolidays[nextDateStr].add(staff.name);
            specialAssignedTomorrowOnly.add(staff.name);
          }
        }
      }
    }

    // 休みポジションの出力（既定の休み情報）
    holidayPosYukyu.forEach((pos, j) => {
      const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
      if (!match) return;
      const colLetter = match[1];
      const baseRow = parseInt(match[2], 10);
      const targetRow = baseRow + 1 + i;
      if (pos.allowMultiple) {
        worksheet.getCell(`${colLetter}${targetRow}`).value =
          holidayStaffYukyu.map((s) => s.name).join(", ");
      } else {
        worksheet.getCell(`${colLetter}${targetRow}`).value =
          j < holidayStaffYukyu.length ? holidayStaffYukyu[j].name : "";
      }
    });
    holidayPosFurikyu.forEach((pos, j) => {
      const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
      if (!match) return;
      const colLetter = match[1];
      const baseRow = parseInt(match[2], 10);
      const targetRow = baseRow + 1 + i;
      if (pos.allowMultiple) {
        worksheet.getCell(`${colLetter}${targetRow}`).value =
          holidayStaffFurikyu.map((s) => s.name).join(", ");
      } else {
        worksheet.getCell(`${colLetter}${targetRow}`).value =
          j < holidayStaffFurikyu.length ? holidayStaffFurikyu[j].name : "";
      }
    });
    holidayPosDaikyu.forEach((pos, j) => {
      const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
      if (!match) return;
      const colLetter = match[1];
      const baseRow = parseInt(match[2], 10);
      const targetRow = baseRow + 1 + i;
      if (pos.allowMultiple) {
        worksheet.getCell(`${colLetter}${targetRow}`).value =
          holidayStaffDaikyu.map((s) => s.name).join(", ");
      } else {
        worksheet.getCell(`${colLetter}${targetRow}`).value =
          j < holidayStaffDaikyu.length ? holidayStaffDaikyu[j].name : "";
      }
    });

    // 当日の利用可能スタッフを決定
    const unassignedStaff = new Set(filteredStaffList.map((s) => s.name));
    [...holidayStaffYukyu, ...holidayStaffFurikyu, ...holidayStaffDaikyu].forEach((s) =>
      unassignedStaff.delete(s.name)
    );
    specialAssigned.forEach((name) => unassignedStaff.delete(name));
    if (specialHolidays[dateStr]) {
      specialHolidays[dateStr].forEach((name) => unassignedStaff.delete(name));
    }

    // 土日・祝日は通常配置をスキップ（特別割当は既に出力済み）
    const holidayFlag = await isJapaneseHoliday(date);
    if (day === 0 || day === 6 || holidayFlag) continue;

    // ★【通常配置の再配置試行】★
    // バックアップ状態
    const preservedAssignments: { [posId: string]: string[] } = {};
    for (const pos of normalPositions) {
      preservedAssignments[pos.id] = staffAssignments[dateStr][pos.id]
        ? [...staffAssignments[dateStr][pos.id]]
        : [];
    }

    const maxRetries = 10;
    let attempt = 0;
    let assignmentValid = false;
    while (attempt < maxRetries && !assignmentValid) {
      // 再試行開始時にバックアップ状態で初期化
      for (const pos of normalPositions) {
        staffAssignments[dateStr][pos.id] = [...(preservedAssignments[pos.id] || [])];
      }
      // 利用可能スタッフの再計算
      const availableStaff = new Set(filteredStaffList.map((s) => s.name));
      [...holidayStaffYukyu, ...holidayStaffFurikyu, ...holidayStaffDaikyu].forEach((s) =>
        availableStaff.delete(s.name)
      );
      if (specialHolidays[dateStr]) {
        specialHolidays[dateStr].forEach((name) => availableStaff.delete(name));
      }
      specialAssigned.forEach((name) => availableStaff.delete(name));

      const dailyAssigned = new Set<string>(); // staffSeveral=false 用
      const dailyAssignedSeveral = new Set<string>(); // staffSeveral=true 用

      // --- 依存ポジションの割当処理 ---
      let depAssignmentValid = true;
      for (const pos of normalPositions) {
        if (!pos.dependence || pos.dependence.trim() === "") continue; // 依存設定がなければスキップ
        const independentPosId = pos.dependence;
        const prevBusinessDateStr = await getPreviousBusinessDay(date);
        // 前営業日の割当結果が存在しない場合は、未配置とする
        if (
          !prevBusinessDateStr ||
          !staffAssignments[prevBusinessDateStr] ||
          !staffAssignments[prevBusinessDateStr][independentPosId] ||
          staffAssignments[prevBusinessDateStr][independentPosId].length === 0
        ) {
          // ここでは「未配置」として割り当てるか、もしくは通常の割当処理に任せる
          staffAssignments[dateStr][pos.id].push("未配置");
          continue; // 次のポジションへ
        }
        // 直近で配置された独立ポジションのスタッフを候補とする
        const candidateStaff =
          staffAssignments[prevBusinessDateStr][independentPosId][
            staffAssignments[prevBusinessDateStr][independentPosId].length - 1
          ];
        // 当日の availableStaff に含まれていれば採用
        if (!availableStaff.has(candidateStaff)) {
          // 候補が当日利用可能でなければ、未配置とする
          staffAssignments[dateStr][pos.id].push("未配置");
          continue;
        }
        staffAssignments[dateStr][pos.id].push(candidateStaff);
        availableStaff.delete(candidateStaff);
      }

      if (!depAssignmentValid) {
        attempt++;
        console.log(`[${dateStr}] 依存ポジションの割当失敗（再試行 ${attempt} 回目）`);
        continue;
      }

      // --- 通常（独立）ポジションの割当処理 ---
      // 依存ポジションはすでに処理済みのため、依存設定がないポジションのみ
      for (const pos of normalPositions) {
        if (pos.dependence && pos.dependence.trim() !== "") continue;
        if (pos.staffSeveral) {
          // staffSeveral=true の処理（既存ロジックそのまま）
          const candidates = filteredStaffList.filter((s) => {
            if (!s.availablePositions || !s.availablePositions.includes(pos.name)) return false;
            if (dailyAssignedSeveral.has(s.name)) return false;
            if (
              holidayStaffYukyu.some((h) => h.name === s.name) ||
              holidayStaffFurikyu.some((h) => h.name === s.name) ||
              holidayStaffDaikyu.some((h) => h.name === s.name)
            )
              return false;
            if (specialAssignedTomorrowOnly.has(s.name)) return false;
            return availableStaff.has(s.name);
          });
          if (candidates.length > 0) {
            let minCount = Infinity;
            for (const s of candidates) {
              const count = staffSeveralCount[s.name] || 0;
              if (count < minCount) minCount = count;
            }
            const finalCandidates = candidates.filter(
              (s) => (staffSeveralCount[s.name] || 0) === minCount
            );
            const chosenObj = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
            const chosen = chosenObj.name;
            staffAssignments[dateStr][pos.id].push(chosen);
            dailyAssignedSeveral.add(chosen);
            staffSeveralCount[chosen] = (staffSeveralCount[chosen] || 0) + 1;
          } else {
            staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
          }
        } else {
          let alreadyAssignedName: string | null = null;
          let firstWeekday: Date | null = null;
          if (pos.sameStaffWeekly) {
            const curDate = new Date(date);
            const diff = curDate.getDay() === 0 ? -6 : 1 - curDate.getDay();
            const candidate = new Date(curDate);
            candidate.setDate(curDate.getDate() + diff);
            for (let d = new Date(candidate); d <= curDate; d.setDate(d.getDate() + 1)) {
              if (d.getDay() !== 0 && d.getDay() !== 6 && !(await isJapaneseHoliday(d))) {
                firstWeekday = new Date(d);
                break;
              }
            }
            if (firstWeekday) {
              const weekKey = `${formatDateLocal(firstWeekday)}_${pos.id}`;
              if (
                weeklyAssignments[weekKey] &&
                weeklyAssignments[weekKey] !== prevWeeklyAssignments[weekKey] &&
                ![
                  ...holidayStaffYukyu,
                  ...holidayStaffFurikyu,
                  ...holidayStaffDaikyu,
                ].some((s) => s.name === weeklyAssignments[weekKey]) &&
                !(specialHolidays[dateStr] && specialHolidays[dateStr].has(weeklyAssignments[weekKey]))
              ) {
                alreadyAssignedName = weeklyAssignments[weekKey];
              }
            }
          }
          if (alreadyAssignedName && !dailyAssigned.has(alreadyAssignedName)) {
            staffAssignments[dateStr][pos.id].push(alreadyAssignedName);
            dailyAssigned.add(alreadyAssignedName);
            availableStaff.delete(alreadyAssignedName);
          } else {
            const availableForPos = filteredStaffList
              .filter((s) => {
                if (!s.availablePositions || !s.availablePositions.includes(pos.name)) return false;
                if (!availableStaff.has(s.name)) return false;
                if (dailyAssigned.has(s.name)) return false;
                return true;
              })
              .map((s) => s.name);
            // もしこの独立ポジションが他から参照される（依存される）場合、次の平日の利用可能性もチェック
            if (referencedIndependentIds.has(pos.id)) {
              let chosen = "";
              for (const cand of availableForPos) {
                if (await isCandidateAvailableNextBusinessDay(cand, date, filteredStaffList)) {
                  chosen = cand;
                  break;
                }
              }
              if (chosen !== "") {
                staffAssignments[dateStr][pos.id].push(chosen);
                dailyAssigned.add(chosen);
                availableStaff.delete(chosen);
                if (pos.sameStaffWeekly && firstWeekday && formatDateLocal(date) === formatDateLocal(firstWeekday)) {
                  const weekKey = `${formatDateLocal(firstWeekday)}_${pos.id}`;
                  weeklyAssignments[weekKey] = chosen;
                }
              } else {
                staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
              }
            } else {
              if (availableForPos.length > 0) {
                const chosen = availableForPos[Math.floor(Math.random() * availableForPos.length)];
                staffAssignments[dateStr][pos.id].push(chosen);
                dailyAssigned.add(chosen);
                availableStaff.delete(chosen);
                if (pos.sameStaffWeekly && firstWeekday && formatDateLocal(date) === formatDateLocal(firstWeekday)) {
                  const weekKey = `${formatDateLocal(firstWeekday)}_${pos.id}`;
                  weeklyAssignments[weekKey] = chosen;
                }
              } else {
                staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
              }
            }
          }
        }
      }

      // フォールバック処理：未配置スタッフの再配置
      if (availableStaff.size > 0) {
        const stillUnassigned = Array.from(availableStaff)
          .map((name) => filteredStaffList.find((s) => s.name === name))
          .filter((s): s is StaffData => s !== undefined)
          .sort((a, b) => a.availablePositions.length - b.availablePositions.length);
        for (const staffObj of stillUnassigned) {
          const candidatePositions = normalPositions.filter((pos) => {
            if (pos.staffSeveral) return false;
            if (!staffObj.availablePositions.includes(pos.name)) return false;
            if (!pos.allowMultiple) {
              const assigned = staffAssignments[dateStr][pos.id] || [];
              return assigned.length === 0;
            }
            return true;
          });
          if (candidatePositions.length > 0) {
            const chosenPos = candidatePositions[0];
            staffAssignments[dateStr][chosenPos.id].push(staffObj.name);
            dailyAssigned.add(staffObj.name);
            availableStaff.delete(staffObj.name);
          }
        }
      }

      if (availableStaff.size === 0) {
        assignmentValid = true;
      } else {
        attempt++;
        console.log(
          `【${dateStr}】再配置試行 ${attempt} 回目: 未配置のスタッフ -> ${Array.from(
            availableStaff
          ).join(", ")}`
        );
      }
    }
    // ★【通常配置処理 終了】★
  }

  // Excel出力：各通常ポジションの配置結果を outputCell に従って出力
  normalPositions.forEach((pos) => {
    if (!pos.outputCell) return;
    const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    const colLetter = match[1];
    const baseRow = parseInt(match[2], 10);
    worksheet.getCell(pos.outputCell).value = pos.name;
    for (let i = 0; i < dates.length; i++) {
      const targetRow = baseRow + 1 + i;
      const dateStr = formatDateLocal(dates[i]);
      const assignmentArr = staffAssignments[dateStr]?.[pos.id] || [];
      const assignment = assignmentArr.filter((name) => name !== "").join(", ");
      worksheet.getCell(`${colLetter}${targetRow}`).value = assignment;
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const uint8Array = new Uint8Array(buffer);
  const arrayBuffer = uint8Array.buffer;
  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="kinmu.xlsx"',
    },
  });
}
