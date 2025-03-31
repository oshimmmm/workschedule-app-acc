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
  horidayToday?: boolean;
  horidayTomorrow?: boolean;
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
}

type StaffIndexable = StaffData & {
  [key: string]: unknown;
};

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

async function getNextBusinessDay(date: Date): Promise<string | null> {
  const next = new Date(date);
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
  const prev = new Date(date);
  let attempts = 0;
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

// async function isCandidateAvailableNextBusinessDay(
//   candidate: string,
//   currentDate: Date,
//   filteredStaffList: StaffData[],
//   specialHolidaysNext?: Set<string>,
//   holidaysYukyuNext?: Set<string>,
//   holidaysFurikyuNext?: Set<string>,
//   holidaysDaikyuNext?: Set<string>
// ): Promise<boolean> {
//   const nextBusinessDateStr = await getNextBusinessDay(currentDate);
//   if (!nextBusinessDateStr) return false;
//   const staff = filteredStaffList.find((s) => s.name === candidate);
//   if (!staff) return false;
//   if (staff.holidaysYukyu && staff.holidaysYukyu.includes(nextBusinessDateStr)) return false;
//   if (staff.holidaysFurikyu && staff.holidaysFurikyu.includes(nextBusinessDateStr)) return false;
//   if (staff.holidaysDaikyu && staff.holidaysDaikyu.includes(nextBusinessDateStr)) return false;
//   if (specialHolidaysNext && specialHolidaysNext.has(candidate)) return false;
//   if (holidaysYukyuNext && holidaysYukyuNext.has(candidate)) return false;
//   if (holidaysFurikyuNext && holidaysFurikyuNext.has(candidate)) return false;
//   if (holidaysDaikyuNext && holidaysDaikyuNext.has(candidate)) return false;
//   return true;
// }

export async function POST(request: Request) {
  const { month, department } = (await request.json()) as { month: string; department?: string };
  if (!month) {
    return NextResponse.json({ error: "月が指定されていません" }, { status: 400 });
  }
  const dates = getDatesInMonth(month);
  if (dates.length === 0) {
    return NextResponse.json({ error: "指定された月の日付を取得できません" }, { status: 400 });
  }

  const posSnapshot = await getDocs(collection(db, "positions"));
  const positions: PositionData[] = posSnapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as PositionData)
  );
  const staffSnapshot = await getDocs(collection(db, "staff"));
  const staffList: StaffData[] = staffSnapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as StaffData)
  );

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

  filteredPositions.sort((a, b) => a.priority - b.priority);

  const holidayPosYukyu = filteredPositions.filter((pos) =>
    pos.name.startsWith("休み(有休)")
  );
  const holidayPosFurikyu = filteredPositions.filter((pos) =>
    pos.name.startsWith("休み(振休)")
  );
  const holidayPosDaikyu = filteredPositions.filter((pos) =>
    pos.name.startsWith("休み(代休)")
  );

  const normalPositions = filteredPositions.filter((pos) => !pos.name.startsWith("休み"));

  const referencedIndependentIds = new Set<string>();
  for (const pos of normalPositions) {
    if (pos.dependence && pos.dependence.trim() !== "") {
      referencedIndependentIds.add(pos.dependence);
    }
  }

  // 事前計算フェーズ：対象月全体の specialHolidays 情報を算出（上書き管理）
  const preCalcSpecialHolidays: { [dateStr: string]: Set<string> } = {};
  for (const date of dates) {
    const dStr = formatDateLocal(date);
    if (!preCalcSpecialHolidays[dStr]) {
      preCalcSpecialHolidays[dStr] = new Set<string>();
    }
    for (const pos of normalPositions) {
      for (const staff of staffList) {
        const staffIndexable = staff as StaffIndexable;
        const specialField = staffIndexable[pos.name] as string[] | undefined;
        if (Array.isArray(specialField) && specialField.includes(dStr)) {
          if (pos.horidayToday && pos.horidayTomorrow) {
            preCalcSpecialHolidays[dStr].add(staff.name);
            const nextDateStr = await getNextBusinessDay(date);
            if (nextDateStr) {
              preCalcSpecialHolidays[nextDateStr] = new Set<string>([staff.name]);
            }
          } else if (pos.horidayToday) {
            preCalcSpecialHolidays[dStr].add(staff.name);
          } else if (!pos.horidayToday && pos.horidayTomorrow) {
            const nextDateStr = await getNextBusinessDay(date);
            if (nextDateStr) {
              preCalcSpecialHolidays[nextDateStr] = new Set<string>([staff.name]);
            }
          }
        }
      }
    }
    console.log(`事前計算: 日付 ${dStr} の specialHolidays =`, preCalcSpecialHolidays[dStr]);
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("勤務表");
  worksheet.getCell("A1").value = "日付";

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

  let weeklyAssignments: { [weekKey: string]: string } = {};
  let prevWeeklyAssignments: { [weekKey: string]: string } = {};
  let currentWeekStart: string = "";

  const staffAssignments: { [dateStr: string]: { [posId: string]: string[] } } = {};

  // // 従来の global カウンター（staffSeveral=false 用など）は staffSeveralCount として残す
  // const staffSeveralCount: { [name: string]: number } = {};

  // ここでは、各 staffSeveral=true のポジションごとの個別カウンターを管理する
  const staffSeveralCounts: { [posId: string]: { [staffName: string]: number } } = {};
  // 新たに、通常ポジション（staffSeveralがfalse）の個別カウンターを管理する
  const normalCounts: { [posId: string]: { [staffName: string]: number } } = {};

  const specialHolidays: { [dateStr: string]: Set<string> } = {};

  console.log(`[generate] dates.length = ${dates.length}`);
  console.log(`[generate] positions.length = ${filteredPositions.length}`);
  console.log(`[generate] staffList.length = ${filteredStaffList.length}`);

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = formatDateLocal(date);
    const rowIndex = i + 2;
    worksheet.getCell(`A${rowIndex}`).value = dateStr;
    const day = date.getDay();

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

    const holidayStaffYukyu = filteredStaffList.filter(
      (s) => s.holidaysYukyu && Array.isArray(s.holidaysYukyu) && s.holidaysYukyu.includes(dateStr)
    );
    const holidayStaffFurikyu = filteredStaffList.filter(
      (s) => s.holidaysFurikyu && Array.isArray(s.holidaysFurikyu) && s.holidaysFurikyu.includes(dateStr)
    );
    const holidayStaffDaikyu = filteredStaffList.filter(
      (s) => s.holidaysDaikyu && Array.isArray(s.holidaysDaikyu) && s.holidaysDaikyu.includes(dateStr)
    );

    // ★【特別割当処理】★
    const specialAssigned = new Set<string>();
    const specialAssignedTomorrowOnly = new Set<string>();
    if (!staffAssignments[dateStr]) {
      staffAssignments[dateStr] = {};
    }
    for (const pos of normalPositions) {
      if (!staffAssignments[dateStr][pos.id]) {
        staffAssignments[dateStr][pos.id] = [];
      }
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

    // 休みポジションの出力
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

    const unassignedStaff = new Set(filteredStaffList.map((s) => s.name));
    [...holidayStaffYukyu, ...holidayStaffFurikyu, ...holidayStaffDaikyu].forEach((s) =>
      unassignedStaff.delete(s.name)
    );
    specialAssigned.forEach((name) => unassignedStaff.delete(name));
    if (specialHolidays[dateStr]) {
      specialHolidays[dateStr].forEach((name) => unassignedStaff.delete(name));
    }

    const holidayFlag = await isJapaneseHoliday(date);
    if (day === 0 || day === 6 || holidayFlag) continue;

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
      for (const pos of normalPositions) {
        staffAssignments[dateStr][pos.id] = [...(preservedAssignments[pos.id] || [])];
      }
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

      // ①【依存ポジションの割当処理】
      for (const pos of normalPositions) {
        if (!pos.dependence || pos.dependence.trim() === "") continue;
        const independentPosId = pos.dependence;
        const prevBusinessDateStr = await getPreviousBusinessDay(date);
        if (
          !prevBusinessDateStr ||
          !staffAssignments[prevBusinessDateStr] ||
          !staffAssignments[prevBusinessDateStr][independentPosId] ||
          staffAssignments[prevBusinessDateStr][independentPosId].length === 0
        ) {
          staffAssignments[dateStr][pos.id].push("未配置");
          continue;
        }
        const candidateStaff =
          staffAssignments[prevBusinessDateStr][independentPosId][
            staffAssignments[prevBusinessDateStr][independentPosId].length - 1
          ];
        staffAssignments[dateStr][pos.id].push(candidateStaff);
        availableStaff.delete(candidateStaff);
        dailyAssigned.add(candidateStaff);
      }

      // ②【被依存ポジションの割当処理】
      for (const pos of normalPositions) {
        if (pos.dependence && pos.dependence.trim() !== "") continue;
        if (!referencedIndependentIds.has(pos.id)) continue;
        const nextBusinessDateStr = await getNextBusinessDay(date);
        const specialHolidaysNext =
          nextBusinessDateStr && preCalcSpecialHolidays[nextBusinessDateStr]
            ? preCalcSpecialHolidays[nextBusinessDateStr]
            : new Set<string>();
        const holidaysYukyuNext = nextBusinessDateStr
          ? new Set(
              filteredStaffList
                .filter(s => s.holidaysYukyu && s.holidaysYukyu.includes(nextBusinessDateStr))
                .map(s => s.name)
            )
          : new Set<string>();
        const holidaysFurikyuNext = nextBusinessDateStr
          ? new Set(
              filteredStaffList
                .filter(s => s.holidaysFurikyu && s.holidaysFurikyu.includes(nextBusinessDateStr))
                .map(s => s.name)
            )
          : new Set<string>();
        const holidaysDaikyuNext = nextBusinessDateStr
          ? new Set(
              filteredStaffList
                .filter(s => s.holidaysDaikyu && s.holidaysDaikyu.includes(nextBusinessDateStr))
                .map(s => s.name)
            )
          : new Set<string>();
        console.log(
          `被依存ポジション ${pos.name}：次営業日(${nextBusinessDateStr})の specialHolidays:`,
          specialHolidaysNext,
          "holidaysYukyu:",
          holidaysYukyuNext,
          "holidaysFurikyu:",
          holidaysFurikyuNext,
          "holidaysDaikyu:",
          holidaysDaikyuNext
        );
        const candidates = filteredStaffList.filter((s) => {
          if (!s.availablePositions || !s.availablePositions.includes(pos.name)) return false;
          if (!availableStaff.has(s.name)) return false;
          if (dailyAssigned.has(s.name)) return false;
          if (
            specialHolidaysNext.has(s.name) ||
            holidaysYukyuNext.has(s.name) ||
            holidaysFurikyuNext.has(s.name) ||
            holidaysDaikyuNext.has(s.name)
          )
            return false;
          return true;
        }).map((s) => s.name);
        console.log(`被依存ポジション ${pos.name}：候補スタッフ:`, candidates);
        if (candidates.length > 0) {
          const chosen = candidates[Math.floor(Math.random() * candidates.length)];
          staffAssignments[dateStr][pos.id].push(chosen);
          dailyAssigned.add(chosen);
          availableStaff.delete(chosen);
        } else {
          staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
        }
      }

      // ③【通常ポジション（その他）の割当処理】（独立で、被依存ではないもの）
      for (const pos of normalPositions) {
        if (pos.dependence && pos.dependence.trim() !== "") continue;
        if (referencedIndependentIds.has(pos.id)) continue;
        if (pos.staffSeveral) {
          // staffSeveral=true は既存の個別カウンター staffSeveralCounts を使用
          if (!staffSeveralCounts[pos.id]) {
            staffSeveralCounts[pos.id] = {};
          }
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
            return true;
          });
          console.log(`通常ポジション ${pos.name}（staffSeveral=true）: 候補スタッフ:`, candidates.map(s => s.name));
          if (candidates.length > 0) {
            let minCount = Infinity;
            for (const s of candidates) {
              const count = staffSeveralCounts[pos.id][s.name] || 0;
              if (count < minCount) minCount = count;
            }
            const finalCandidates = candidates.filter(
              (s) => (staffSeveralCounts[pos.id][s.name] || 0) === minCount
            );
            const chosenObj = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
            const chosen = chosenObj.name;
            staffAssignments[dateStr][pos.id].push(chosen);
            dailyAssignedSeveral.add(chosen);
            staffSeveralCounts[pos.id][chosen] = (staffSeveralCounts[pos.id][chosen] || 0) + 1;
          } else {
            staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
          }
        } else {
          // 通常ポジション（staffSeveral=false）の場合、ここで各ポジションごとの個別カウンターを使用
          if (!normalCounts[pos.id]) {
            normalCounts[pos.id] = {};
          }
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
            if (availableForPos.length > 0) {
              let minCount = Infinity;
              for (const sName of availableForPos) {
                const count = normalCounts[pos.id][sName] || 0;
                if (count < minCount) minCount = count;
              }
              const finalCandidates = availableForPos.filter(sName => (normalCounts[pos.id][sName] || 0) === minCount);
              const chosen = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
              staffAssignments[dateStr][pos.id].push(chosen);
              dailyAssigned.add(chosen);
              availableStaff.delete(chosen);
              normalCounts[pos.id][chosen] = (normalCounts[pos.id][chosen] || 0) + 1;
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
          `【${dateStr}】再配置試行 ${attempt} 回目: 未配置のスタッフ -> ${Array.from(availableStaff).join(", ")}`
        );
      }
    }
  }

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
