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
  departments?: string[];
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

// --- 日本の祝日を外部APIから取得する例 ---
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
  const month = date.getMonth() + 1; // 0-basedなので+1
  const dateStr = formatDateLocal(date);
  const holidays = await getJapaneseHolidays(year, month);
  return holidays.includes(dateStr);
}

// --- 自前のローカル日付フォーマット関数 ---
function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 指定月 (YYYY-MM) の日付一覧を生成
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

export async function POST(request: Request) {
  // 部門パラメーターを追加
  const { month, department } = await request.json() as { month: string; department?: string };
  if (!month) {
    return NextResponse.json({ error: "月が指定されていません" }, { status: 400 });
  }
  const dates = getDatesInMonth(month);
  if (dates.length === 0) {
    return NextResponse.json({ error: "指定された月の日付を取得できません" }, { status: 400 });
  }

  // Firestore からポジションとスタッフを取得
  const posSnapshot = await getDocs(collection(db, "positions"));
  const positions: PositionData[] = posSnapshot.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...data } as PositionData;
  });

  const staffSnapshot = await getDocs(collection(db, "staff"));
  const staffList: StaffData[] = staffSnapshot.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...data } as StaffData;
  });

  // 部門フィルターが指定されていればフィルタリング
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

  // 優先度でソート（1が最優先）
  filteredPositions.sort((a: PositionData, b: PositionData) => a.priority - b.priority);

  // 休み用ポジションの抽出（名称により判別）
  const holidayPosYukyu = filteredPositions.filter((pos) => pos.name.startsWith("休み(有休)"));
  const holidayPosFurikyu = filteredPositions.filter((pos) => pos.name.startsWith("休み(振休)"));
  const holidayPosDaikyu = filteredPositions.filter((pos) => pos.name.startsWith("休み(代休)"));

  // 通常ポジション（休みポジション以外）
  const normalPositions = filteredPositions.filter((pos) => !pos.name.startsWith("休み"));

  // Excel ワークブック作成
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("勤務表");

  // A列に日付（1行目ヘッダー）
  worksheet.getCell("A1").value = "日付";

  // 通常ポジションの header 出力（outputCell利用）
  normalPositions.forEach((pos) => {
    if (!pos.outputCell) return;
    const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    worksheet.getCell(pos.outputCell).value = pos.name;
  });

  // 休みポジションの header 出力（各種）
  [holidayPosYukyu, holidayPosFurikyu, holidayPosDaikyu].forEach((holidayPosArr) => {
    holidayPosArr.forEach((pos) => {
      if (!pos.outputCell) return;
      const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
      if (!match) return;
      worksheet.getCell(pos.outputCell).value = pos.name;
    });
  });

  // 1週間同一スタッフ用マップと前週割当の管理
  let weeklyAssignments: { [weekKey: string]: string } = {};
  let prevWeeklyAssignments: { [weekKey: string]: string } = {};
  let currentWeekStart: string = "";

  // 通常スタッフ配置用マップ: { [dateStr]: { [posId]: string[] } }
  const staffAssignments: { [dateStr: string]: { [posId: string]: string[] } } = {};

  console.log(`[generate] dates.length = ${dates.length}`);
  console.log(`[generate] positions.length = ${filteredPositions.length}`);
  console.log(`[generate] staffList.length = ${filteredStaffList.length}`);

  // 日付ごとにループ
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = formatDateLocal(date);
    const rowIndex = i + 2;
    worksheet.getCell(`A${rowIndex}`).value = dateStr;
    const day = date.getDay();

    // 週の開始日（月曜日）の算出
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

    // 休みスタッフの抽出：各種
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

    // 休みポジションの出力：各種
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

    // 土日・祝日は通常スタッフ配置をスキップ
    const holidayFlag = await isJapaneseHoliday(date);
    if (day === 0 || day === 6 || holidayFlag) continue;

    // 通常スタッフ配置処理
    staffAssignments[dateStr] = {};
    let dailyAssigned = new Set<string>();
    // ※必ず全スタッフ（休みスタッフ以外）を配置するため、未配置対象は全スタッフから休みスタッフを除外
    let unassignedStaff = new Set(filteredStaffList.map((s) => s.name));
    [...holidayStaffYukyu, ...holidayStaffFurikyu, ...holidayStaffDaikyu].forEach((s) => {
      unassignedStaff.delete(s.name);
    });

    // 通常ポジションの配置処理（for...of ループ）
    for (const pos of normalPositions) {
      staffAssignments[dateStr][pos.id] = [];
      let alreadyAssignedName: string | null = null;
      let firstWeekday: Date | null = null;
      if (pos.sameStaffWeekly) {
        const curDate = new Date(date);
        const diff = curDate.getDay() === 0 ? -6 : 1 - curDate.getDay();
        const candidate = new Date(curDate);
        candidate.setDate(curDate.getDate() + diff);
        for (let d = new Date(candidate); d <= curDate; d.setDate(d.getDate() + 1)) {
          const dDay = d.getDay();
          if (dDay !== 0 && dDay !== 6 && !(await isJapaneseHoliday(d))) {
            firstWeekday = new Date(d);
            break;
          }
        }
        if (firstWeekday) {
          const weekKey = `${formatDateLocal(firstWeekday)}_${pos.id}`;
          // 前週と同じスタッフは再利用しない
          if (
            weeklyAssignments[weekKey] &&
            weeklyAssignments[weekKey] !== prevWeeklyAssignments[weekKey] &&
            ![...holidayStaffYukyu, ...holidayStaffFurikyu, ...holidayStaffDaikyu].some(
              (s) => s.name === weeklyAssignments[weekKey]
            )
          ) {
            alreadyAssignedName = weeklyAssignments[weekKey];
          }
        }
      }
      if (alreadyAssignedName && !dailyAssigned.has(alreadyAssignedName)) {
        staffAssignments[dateStr][pos.id].push(alreadyAssignedName);
        dailyAssigned.add(alreadyAssignedName);
        unassignedStaff.delete(alreadyAssignedName);
        continue;
      }
      const availableStaff = filteredStaffList
        .filter((s) => {
          if (!s.availablePositions || !Array.isArray(s.availablePositions)) return false;
          return (
            s.availablePositions.includes(pos.name) &&
            unassignedStaff.has(s.name) &&
            !dailyAssigned.has(s.name)
          );
        })
        .map((s) => s.name);
      if (availableStaff.length > 0) {
        const chosen = availableStaff[Math.floor(Math.random() * availableStaff.length)];
        staffAssignments[dateStr][pos.id].push(chosen);
        dailyAssigned.add(chosen);
        unassignedStaff.delete(chosen);
        if (pos.sameStaffWeekly && firstWeekday && formatDateLocal(date) === formatDateLocal(firstWeekday)) {
          const weekKey = `${formatDateLocal(firstWeekday)}_${pos.id}`;
          weeklyAssignments[weekKey] = chosen;
        }
      } else {
        staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
      }
    }

    // フォールバック処理：未配置スタッフを必ずどこかに配置する
    if (unassignedStaff.size > 0) {
      const stillUnassigned = Array.from(unassignedStaff)
        .map((name) => filteredStaffList.find((s) => s.name === name))
        .filter((s): s is StaffData => s !== undefined)
        .sort((a, b) => a.availablePositions.length - b.availablePositions.length);
      for (const staffObj of stillUnassigned) {
        const candidatePositions = normalPositions.filter((pos) => {
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
        }
      }
    }
  }

  // 通常ポジションの配置結果を各ポジションの outputCell に従って出力
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
      const assignment = assignmentArr.join(", ");
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
