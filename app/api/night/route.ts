// app/api/night/route.ts
import { NextResponse } from "next/server";
import db from "../../../firebase/db";
import { collection, getDocs, updateDoc, doc, arrayUnion } from "firebase/firestore";
import ExcelJS from "exceljs";
import { format, addDays, differenceInCalendarDays } from "date-fns";

interface PositionData {
  id: string;
  name: string;
  outputCell: string;
  priority: number;
  required: boolean;
  sameStaffWeekly: boolean;
  allowMultiple: boolean;
  departments?: string[];
}

interface StaffData {
  id: string;
  name: string;
  availablePositions: string[];
  departments?: string[];
  experience?: number; // 経験値(年数)など
}

// 日本の祝日取得（外部API）
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
  const dateStr = format(date, "yyyy-MM-dd");
  const holidays = await getJapaneseHolidays(year, month);
  return holidays.includes(dateStr);
}

// 日付フォーマット
function formatDateLocal(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// 指定月の日付一覧生成（全日付）
function getDatesInMonth(monthStr: string): Date[] {
  const [year, month] = monthStr.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const dates: Date[] = [];
  let current = new Date(firstDay);
  while (current <= lastDay) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// 指定した月範囲の各月文字列を取得する
function getMonthRange(startMonth: string, endMonth: string): string[] {
  const [startYear, startMon] = startMonth.split("-").map(Number);
  const [endYear, endMon] = endMonth.split("-").map(Number);
  const months: string[] = [];
  let year = startYear;
  let mon = startMon;
  while (year < endYear || (year === endYear && mon <= endMon)) {
    months.push(`${year}-${mon.toString().padStart(2, "0")}`);
    mon++;
    if (mon > 12) {
      mon = 1;
      year++;
    }
  }
  return months;
}

/**
 * 夜勤割当ロジック
 * 追加要件：
 * 1. 直近3日以内に配置されたスタッフは対象外
 * 2. 候補部門カウンターが同値の場合はランダムに選択
 * 3. 部門・部門内のスタッフの選定回数をそれぞれ管理
 * 4. 翌日が土日または日本の祝日の場合は「休日前」カウンターを使用
 * 5. 部門候補には "日直主" と "日直副" を含めない
 * 6. スタッフ選定時は、選択された部門を持つかつ配置するポジション名（pos.name）も departments に持つスタッフのみ対象とする
 */
async function assignNightShift(
  date: Date,
  positions: PositionData[],
  staffList: StaffData[],
  counters: Map<string, number>,
  staffCounters: Map<string, number>,
  staffLastAssigned: Map<string, Date>
): Promise<{ [posId: string]: string }> {
  const assignments: { [posId: string]: string } = {};

  // 翌日が休日（＝土日または日本の祝日）かどうか
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);
  const weekendHoliday = (nextDay.getDay() === 0 || nextDay.getDay() === 6);
  const japaneseHoliday = await isJapaneseHoliday(nextDay);
  const nextDayIsHoliday = weekendHoliday || japaneseHoliday;

  // 当日が休日かどうか
  const currentWeekendHoliday = (date.getDay() === 0 || date.getDay() === 6);
  const currentJapaneseHoliday = await isJapaneseHoliday(date);
  const currentIsHoliday = currentWeekendHoliday || currentJapaneseHoliday;

  // 夜勤用候補部門：スタッフの departments から、「二交代」または「待機」があるスタッフの、"二交代"と"待機"以外の部門
  const candidateDepts = new Set<string>();
  staffList.forEach((staff) => {
    if (staff.departments && (staff.departments.includes("二交代") || staff.departments.includes("待機"))) {
      staff.departments.forEach((dept) => {
        // "日直主" と "日直副" は除外
        if (dept === "日直主" || dept === "日直副") return;
        if (dept !== "二交代" && dept !== "待機") {
          candidateDepts.add(dept);
        }
      });
    }
  });

  // 同一日に既に配置された部門（"生理"は許容）
  const assignedDepts: Set<string> = new Set();

  for (const pos of positions) {
    let selectedDept: string | null = null;
    const candidateInfo: { dept: string; key: string; count: number }[] = [];
    candidateDepts.forEach((dept) => {
      // 当日または翌日が休日の場合、"微生物" は候補から除外する
      if ((nextDayIsHoliday || currentIsHoliday) && dept === "微生物") return;
      if (dept !== "生理" && assignedDepts.has(dept)) return;
      const key = nextDayIsHoliday ? `休日前${pos.name}|${dept}` : `${pos.name}|${dept}`;
      const count = counters.get(key) || 0;
      candidateInfo.push({ dept, key, count });
    });
    console.log(
      `[${formatDateLocal(date)}] Position: ${pos.name} - Candidate departments and counters:`,
      candidateInfo
    );

    if (candidateInfo.length === 0) {
      console.log(`[${formatDateLocal(date)}] Position: ${pos.name} - No candidate department available`);
      assignments[pos.id] = "未配置";
      continue;
    }
    // 最小値の候補群からランダム選択
    const counts = candidateInfo.map(info => info.count);
    const minCountValue = Math.min(...counts);
    const minCandidates = candidateInfo.filter(info => info.count === minCountValue);
    const chosenDeptInfo = minCandidates[Math.floor(Math.random() * minCandidates.length)];
    selectedDept = chosenDeptInfo.dept;

    // 部門カウンター更新：生理は+1、輸血は+3、その他は+2
    const deptKey = nextDayIsHoliday ? `休日前${pos.name}|${selectedDept}` : `${pos.name}|${selectedDept}`;
    const increment = selectedDept === "生理" ? 1 : (selectedDept === "輸血" ? 3 : 2);
    counters.set(deptKey, (counters.get(deptKey) || 0) + increment);
    if (selectedDept !== "生理") {
      assignedDepts.add(selectedDept);
    }
    console.log(
      `[${formatDateLocal(date)}] Position: ${pos.name} - Selected department: ${selectedDept}`
    );
    console.log(
      `[${formatDateLocal(date)}] Position: ${pos.name} - Updated counter for ${deptKey}: ${counters.get(deptKey)}`
    );

    // eligibleStaff：該当部門と、さらに配置するポジション名 (pos.name) を departments に持つスタッフ
    const eligibleStaff = staffList.filter((staff) => {
      if (!(staff.departments || []).includes(selectedDept!)) return false;
      if (!(staff.departments || []).includes(pos.name)) return false;
      const lastAssigned = staffLastAssigned.get(staff.id);
      if (!lastAssigned) return true;
      return differenceInCalendarDays(date, lastAssigned) >= 3;
    });
    if (eligibleStaff.length === 0) {
      console.log(`[${formatDateLocal(date)}] Position: ${pos.name} - No eligible staff available for department ${selectedDept}`);
      assignments[pos.id] = "未配置";
    } else {
      const candidateStaffInfo: { staff: StaffData; key: string; count: number }[] = [];
      eligibleStaff.forEach((staff) => {
        const staffKey = `${selectedDept}|${staff.id}`;
        const count = staffCounters.get(staffKey) || 0;
        candidateStaffInfo.push({ staff, key: staffKey, count });
      });
      const staffCounts = candidateStaffInfo.map(info => info.count);
      const minStaffCount = Math.min(...staffCounts);
      const minStaffCandidates = candidateStaffInfo.filter(info => info.count === minStaffCount);
      const chosenStaffInfo = minStaffCandidates[Math.floor(Math.random() * minStaffCandidates.length)];
      const selectedStaff = chosenStaffInfo.staff;
      staffCounters.set(chosenStaffInfo.key, (staffCounters.get(chosenStaffInfo.key) || 0) + 1);
      staffLastAssigned.set(selectedStaff.id, date);
      console.log(
        `[${formatDateLocal(date)}] Position: ${pos.name} - Selected staff from ${selectedDept}: ${selectedStaff.name}`
      );
      console.log(
        `[${formatDateLocal(date)}] Position: ${pos.name} - Updated staff counter for ${chosenStaffInfo.key}: ${staffCounters.get(chosenStaffInfo.key)}`
      );
      assignments[pos.id] = selectedStaff.name;
      // ★ 追加：更新対象のスタッフドキュメントの、該当ポジション名フィールドに日付を追加
      await updateDoc(doc(db, "staff", selectedStaff.id), {
        [pos.name]: arrayUnion(formatDateLocal(date))
      });
    }
  }

  console.log("Night shift assignments:", assignments);
  return assignments;
}

/**
 * 日直割当ロジック
 * 当日が休日の場合に実施。
 * 休日前判定は不要。カウンターキーは "ポジション名|選択部門名|"
 * スタッフ選定は、まず該当部門を持ち、さらに配置するポジション名 (pos.name) を departments に持つスタッフからランダムに選択
 */
async function assignNichokuShift(
  date: Date,
  positions: PositionData[],
  staffList: StaffData[],
  counters: Map<string, number>,
  staffCounters: Map<string, number>,
  staffLastAssigned: Map<string, Date>
): Promise<{ [posId: string]: string }> {
  const assignments: { [posId: string]: string } = {};
  
  for (const pos of positions) {
    let selectedDept: string | null = null;
    const candidateInfo: { dept: string; key: string; count: number }[] = [];
    // 日直用候補部門は、スタッフの departments から「二交代」「待機」以外の部門を抽出
    // ただし、ここでは"日直主"の場合は ["病理", "輸血", "生化学", "血液"]、"日直副"の場合は ["生理", "病理"] のみ許可する
    const candidateDepts = new Set<string>();
    staffList.forEach((staff) => {
      if (staff.departments && (staff.departments.includes("二交代") || staff.departments.includes("待機"))) {
        staff.departments.forEach((dept) => {
          // "日直主"・"日直副"は除外
          if (dept === "日直主" || dept === "日直副") return;
          if (dept !== "二交代" && dept !== "待機") {
            candidateDepts.add(dept);
          }
        });
      }
    });
    
    // 許可する部門を pos.name により決定
    let allowedDepts: string[] = [];
    if (pos.name === "日直副") {
      allowedDepts = ["生理", "病理"];
    } else if (pos.name === "日直主") {
      allowedDepts = ["病理", "輸血", "生化学", "血液"];
    } else {
      allowedDepts = Array.from(candidateDepts);
    }
  
    // 候補部門から、allowedDepts に含まれるもののみを candidateInfo に追加
    candidateDepts.forEach((dept) => {
      if (!allowedDepts.includes(dept)) return;
      const key = `${pos.name}|${dept}|`;
      const count = counters.get(key) || 0;
      candidateInfo.push({ dept, key, count });
    });
  
    console.log(
      `[${formatDateLocal(date)}] Nichoku Position: ${pos.name} - Candidate departments and counters:`,
      candidateInfo
    );
    if (candidateInfo.length === 0) {
      console.log(`[${formatDateLocal(date)}] Nichoku Position: ${pos.name} - No candidate department available`);
      assignments[pos.id] = "未配置";
      continue;
    }
    const counts = candidateInfo.map(info => info.count);
    const minCountValue = Math.min(...counts);
    const minCandidates = candidateInfo.filter(info => info.count === minCountValue);
    const chosenDeptInfo = minCandidates[Math.floor(Math.random() * minCandidates.length)];
    selectedDept = chosenDeptInfo.dept;
  
    // 日直用部門カウンター更新（キー："ポジション名|部門名|"）
    const deptKey = `${pos.name}|${selectedDept}|`;
    let increment: number;
    if (selectedDept === "生理") {
      increment = 1;
    } else if (pos.name === "日直副" && selectedDept === "病理") {
      increment = 4; // こちらで+3ではなく+4と指定されています
    } else if (selectedDept === "輸血") {
      increment = 3;
    } else {
      increment = 2;
    }
    counters.set(deptKey, (counters.get(deptKey) || 0) + increment);
    console.log(
      `[${formatDateLocal(date)}] Nichoku Position: ${pos.name} - Selected department: ${selectedDept}`
    );
    console.log(
      `[${formatDateLocal(date)}] Nichoku Position: ${pos.name} - Updated counter for ${deptKey}: ${counters.get(deptKey)}`
    );
  
    // eligibleStaff：まず、selectedDept と配置するポジション名 (pos.name) の両方を持つスタッフを抽出
    let eligibleStaff = staffList.filter((staff) =>
      (staff.departments || []).includes(selectedDept!) && (staff.departments || []).includes(pos.name)
    );
    if (eligibleStaff.length === 0) {
      console.log(`[${formatDateLocal(date)}] Nichoku Position: ${pos.name} - No eligible staff available for department ${selectedDept}`);
      assignments[pos.id] = "未配置";
    } else {
      const candidateStaffInfo: { staff: StaffData; key: string; count: number }[] = [];
      eligibleStaff.forEach((staff) => {
        const staffKey = `${selectedDept}|${staff.id}`;
        const count = staffCounters.get(staffKey) || 0;
        candidateStaffInfo.push({ staff, key: staffKey, count });
      });
      const staffCounts = candidateStaffInfo.map(info => info.count);
      const minStaffCount = Math.min(...staffCounts);
      const minStaffCandidates = candidateStaffInfo.filter(info => info.count === minStaffCount);
      const chosenStaffInfo = minStaffCandidates[Math.floor(Math.random() * minStaffCandidates.length)];
      const selectedStaff = chosenStaffInfo.staff;
      staffCounters.set(chosenStaffInfo.key, (staffCounters.get(chosenStaffInfo.key) || 0) + 1);
      staffLastAssigned.set(selectedStaff.id, date);
      console.log(
        `[${formatDateLocal(date)}] Nichoku Position: ${pos.name} - Selected staff from ${selectedDept}: ${selectedStaff.name}`
      );
      console.log(
        `[${formatDateLocal(date)}] Nichoku Position: ${pos.name} - Updated staff counter for ${chosenStaffInfo.key}: ${staffCounters.get(chosenStaffInfo.key)}`
      );
      assignments[pos.id] = selectedStaff.name;
      // ★ 追加：Firestore の対象スタッフドキュメントの、該当ポジションフィールドに日付を追加
      await updateDoc(doc(db, "staff", selectedStaff.id), {
        [pos.name]: arrayUnion(formatDateLocal(date))
      });
    }
  }
  console.log("Nichoku assignments:", assignments);
  return assignments;
}

export async function POST(request: Request) {
  // リクエストボディから開始月と終了月を取得（例："2025-01", "2025-03"）
  const { startMonth, endMonth } = await request.json();
  if (!startMonth || !endMonth) {
    return NextResponse.json({ error: "開始月と終了月が指定されていません" }, { status: 400 });
  }
  const monthRange = getMonthRange(startMonth, endMonth);
  if (monthRange.length === 0) {
    return NextResponse.json({ error: "指定された月が正しくありません" }, { status: 400 });
  }
  
  // Firestoreからpositionsとstaffを取得
  const posSnapshot = await getDocs(collection(db, "positions"));
  let positions: PositionData[] = posSnapshot.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...data } as PositionData;
  });
  const staffSnapshot = await getDocs(collection(db, "staff"));
  let staffList: StaffData[] = staffSnapshot.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...data } as StaffData;
  });
  
  // 夜勤のポジションと日直のポジションを分ける
  const nightPositions = positions.filter((pos) => pos.departments?.includes("夜勤"));
  const nichokuPositions = positions.filter((pos) => pos.departments?.includes("日直"));
  
  // staff は「二交代」または「待機」(または「生理」)を含むもの
  staffList = staffList.filter((staff) =>
    staff.departments
      ? staff.departments.includes("二交代") ||
        staff.departments.includes("待機") ||
        staff.departments.includes("生理")
      : false
  );
  nightPositions.sort((a, b) => a.priority - b.priority);
  nichokuPositions.sort((a, b) => a.priority - b.priority);
  
  console.log("Night shift positions:", nightPositions);
  console.log("Nichoku positions:", nichokuPositions);
  console.log("Night shift staff:", staffList);
  
  const workbook = new ExcelJS.Workbook();
  // グローバルな状態（複数月に跨って累積）
  let counters: Map<string, number> = new Map();
  let staffCounters: Map<string, number> = new Map();
  let staffLastAssigned: Map<string, Date> = new Map();
  
  const MAX_ATTEMPTS = 3;
  for (const monthStr of monthRange) {
    const dates = getDatesInMonth(monthStr);
    if (dates.length === 0) continue;
    const worksheet = workbook.addWorksheet(monthStr);
    worksheet.getCell("A1").value = "日付";
    // ヘッダー：夜勤ポジション
    nightPositions.forEach((pos) => {
      if (!pos.outputCell) return;
      const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
      if (!match) return;
      worksheet.getCell(pos.outputCell).value = pos.name;
    });
    // ヘッダー：日直ポジション
    nichokuPositions.forEach((pos) => {
      if (!pos.outputCell) return;
      const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
      if (!match) return;
      worksheet.getCell(pos.outputCell).value = pos.name;
    });
  
    let rowIndex = 0;
    for (const date of dates) {
      const dateStr = formatDateLocal(date);
      worksheet.getCell(`A${rowIndex + 2}`).value = dateStr;
      let attempts = 0;
      let assignmentsForDate: { [posId: string]: string } = {};
      while (attempts < MAX_ATTEMPTS) {
        const countersBackup = new Map(counters);
        const staffCountersBackup = new Map(staffCounters);
        const staffLastAssignedBackup = new Map(staffLastAssigned);
        // 夜勤割当
        const nightAssignments = await assignNightShift(date, nightPositions, staffList, counters, staffCounters, staffLastAssigned);
        assignmentsForDate = { ...nightAssignments };
        // 当日が休日の場合、日直割当も実施
        const currentWeekendHoliday = (date.getDay() === 0 || date.getDay() === 6);
        const currentJapaneseHoliday = await isJapaneseHoliday(date);
        const currentIsHoliday = currentWeekendHoliday || currentJapaneseHoliday;
        if (currentIsHoliday && nichokuPositions.length > 0) {
          const nichokuAssignments = await assignNichokuShift(date, nichokuPositions, staffList, counters, staffCounters, staffLastAssigned);
          assignmentsForDate = { ...assignmentsForDate, ...nichokuAssignments };
        }
        let totalExperience = 0;
        for (const posId in assignmentsForDate) {
          const staffName = assignmentsForDate[posId];
          if (staffName !== "未配置") {
            const staff = staffList.find(s => s.name === staffName);
            if (staff && typeof staff.experience === "number") {
              totalExperience += staff.experience;
            }
          }
        }
        if (totalExperience >= 5) {
          break;
        } else {
          counters = countersBackup;
          staffCounters = staffCountersBackup;
          staffLastAssigned = staffLastAssignedBackup;
          attempts++;
        }
      }
      // 書き込み：夜勤ポジション
      nightPositions.forEach((pos) => {
        if (!pos.outputCell) return;
        const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
        if (!match) return;
        const colLetter = match[1];
        const baseRow = parseInt(match[2], 10);
        const assignment = assignmentsForDate[pos.id] || "";
        worksheet.getCell(`${colLetter}${baseRow + 1 + rowIndex}`).value = assignment;
      });
      // 書き込み：日直ポジション
      nichokuPositions.forEach((pos) => {
        if (!pos.outputCell) return;
        const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
        if (!match) return;
        const colLetter = match[1];
        const baseRow = parseInt(match[2], 10);
        const assignment = assignmentsForDate[pos.id] || "";
        worksheet.getCell(`${colLetter}${baseRow + 1 + rowIndex}`).value = assignment;
      });
      rowIndex++;
    }
  }
  
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="nightshift.xlsx"',
    },
  });
}
