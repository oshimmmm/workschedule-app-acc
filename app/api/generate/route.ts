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

/**
 * 指定した年・月の日本の祝日情報を取得する関数
 * 外部API "holidays-jp" を利用し、YYYY-MM-DD形式の祝日の日付一覧を返す
 */
async function getJapaneseHolidays(year: number, month: number): Promise<string[]> {
  try {
    const res = await fetch("https://holidays-jp.github.io/api/v1/date.json");
    if (!res.ok) {
      console.error("祝日API取得エラー", res.statusText);
      return [];
    }
    // レスポンスをJSON形式に変換（全祝日のレコードを取得）
    const data: Record<string, string> = await res.json();
    // 指定月のプレフィックスを生成（例："2025-04"）
    const keyPrefix = `${year}-${month.toString().padStart(2, "0")}`;
    // 指定月で始まる日付（祝日）だけを抽出して返す
    return Object.keys(data).filter((date) => date.startsWith(keyPrefix));
  } catch (error) {
    console.error("祝日API取得例外", error);
    return [];
  }
}

/**
 * 指定された日付が日本の祝日かどうかを判定する
 */
async function isJapaneseHoliday(date: Date): Promise<boolean> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // JavaScriptの月は0～11なので+1する
  const dateStr = formatDateLocal(date); // "YYYY-MM-DD"形式に整形
  const holidays = await getJapaneseHolidays(year, month);
  // 日付文字列が祝日一覧に含まれていればtrue
  return holidays.includes(dateStr);
}

/**
 * 日付オブジェクトを "YYYY-MM-DD" 形式の文字列に変換する関数
 */
function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0"); // 月の桁数を揃える
  const d = String(date.getDate()).padStart(2, "0"); // 日の桁数を揃える
  return `${y}-${m}-${d}`;
}

/**
 * 指定した "YYYY-MM" 形式の文字列から、その月の日付すべての配列を生成する
 */
function getDatesInMonth(monthStr: string): Date[] {
  const [year, month] = monthStr.split("-").map(Number);
  // 不正な年月の場合は空配列を返す
  if (!year || !month || month < 1 || month > 12) return [];
  // 対象月の初日と末日を求める
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const dates: Date[] = [];
  const current = new Date(firstDay);
  // 初日から末日まで1日ずつ加算して配列に格納
  while (current <= lastDay) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * 指定した日付の翌営業日を取得する
 * ※土日または祝日はスキップし、最大10回試行する
 */
async function getNextBusinessDay(date: Date): Promise<string | null> {
  const next = new Date(date);
  let attempts = 0;
  next.setDate(next.getDate() + 1); // 翌日に進める
  while (
    // 日付が土曜日(6)または日曜日(0)または祝日の場合、さらに翌日へ進める
    (next.getDay() === 0 || next.getDay() === 6 || (await isJapaneseHoliday(next))) &&
    attempts < 10
  ) {
    next.setDate(next.getDate() + 1);
    attempts++;
  }
  return attempts < 10 ? formatDateLocal(next) : null;
}

/**
 * 指定した日付の前営業日を取得する
 * ※土日または祝日はスキップし、最大10回試行する
 */
async function getPreviousBusinessDay(date: Date): Promise<string | null> {
  const prev = new Date(date);
  let attempts = 0;
  prev.setDate(prev.getDate() - 1); // 前日に進める
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



/**
 * POSTリクエストにより、指定された月と部門に基づいて勤務表Excelファイルを生成する
 */
export async function POST(request: Request) {
  // リクエストのJSONボディから "month"（例："2025-04"）と "department" を取得
  const { month, department } = (await request.json()) as { month: string; department?: string };
  if (!month) {
    return NextResponse.json({ error: "月が指定されていません" }, { status: 400 });
  }
  // 指定月の全日付リストを生成
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

  // 部門フィルターが指定されている場合、該当部門に所属するポジションとスタッフのみを抽出
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

  // ポジションは、priority（優先度）の昇順に並べ替え
  filteredPositions.sort((a, b) => a.priority - b.priority);

  // 休暇に関するポジションを、それぞれのタイプごとに抽出
  const holidayPosYukyu = filteredPositions.filter((pos) =>
    pos.name.startsWith("休み(有休)")
  );
  const holidayPosFurikyu = filteredPositions.filter((pos) =>
    pos.name.startsWith("休み(振休)")
  );
  const holidayPosDaikyu = filteredPositions.filter((pos) =>
    pos.name.startsWith("休み(代休)")
  );

  // 通常のポジション（休暇系以外）を抽出
  const normalPositions = filteredPositions.filter((pos) => !pos.name.startsWith("休み"));

  // 被依存ポジションとして参照されている独立ポジションのIDをセットで収集
  const referencedIndependentIds = new Set<string>();
  for (const pos of normalPositions) {
    if (pos.dependence && pos.dependence.trim() !== "") {
      referencedIndependentIds.add(pos.dependence);
    }
  }


  // ──────────────────────────────
  // 事前計算フェーズ：対象月全体の specialHolidays 情報を算出
  // ──────────────────────────────
  // 各日付ごとに、特定のポジションでスタッフに対して割り当てられる「特別休暇」の情報を収集
  const preCalcSpecialHolidays: { [dateStr: string]: Set<string> } = {};
  for (const date of dates) {
    const dStr = formatDateLocal(date);
    // 当該日付のセットが未生成なら初期化
    if (!preCalcSpecialHolidays[dStr]) {
      preCalcSpecialHolidays[dStr] = new Set<string>();
    }
    // 各通常ポジションごとに、スタッフの "specialField" をチェック（ポジション名をキーに持つ動的フィールド）
    for (const pos of normalPositions) {
      for (const staff of staffList) {
        const staffIndexable = staff as StaffIndexable;
        const specialField = staffIndexable[pos.name] as string[] | undefined;
        // スタッフがそのポジションに対して特別割当日として当該日付が含まれていれば
        if (Array.isArray(specialField) && specialField.includes(dStr)) {
          // 当日と翌日の両方を休みにする設定の場合
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


  // ──────────────────────────────
  // Excelファイル生成フェーズ
  // ──────────────────────────────
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("勤務表");
  worksheet.getCell("A1").value = "日付";

  // 各ポジションの出力セルにポジション名を配置（通常ポジション）
  normalPositions.forEach((pos) => {
    if (!pos.outputCell) return;
    // 出力セルが "B2" のような形式であるかを正規表現でチェック
    const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    worksheet.getCell(pos.outputCell).value = pos.name;
  });
  // 各休暇ポジションについても同様にセルに配置
  [holidayPosYukyu, holidayPosFurikyu, holidayPosDaikyu].forEach((arr) => {
    arr.forEach((pos) => {
      if (!pos.outputCell) return;
      const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
      if (!match) return;
      worksheet.getCell(pos.outputCell).value = pos.name;
    });
  });


  // ──────────────────────────────
  // 各種割当用の状態管理用変数群の初期化
  // ──────────────────────────────
  let weeklyAssignments: { [weekKey: string]: string } = {};  // 1週間で同一スタッフを使う割当管理
  let prevWeeklyAssignments: { [weekKey: string]: string } = {}; // 前週の割当情報を保持
  let currentWeekStart: string = ""; // 現在の週の開始日（Monday）の文字列

  // 日付ごとに各ポジションへ割り当てられたスタッフ名リストを保持するオブジェクト
  const staffAssignments: { [dateStr: string]: { [posId: string]: string[] } } = {};
// staffSeveral=true のポジションごとにスタッフ別の割当回数を管理するためのカウンター
  const staffSeveralCounts: { [posId: string]: { [staffName: string]: number } } = {};
  // 通常の（staffSeveral=false）ポジションごとのスタッフ別カウンター
  const normalCounts: { [posId: string]: { [staffName: string]: number } } = {};
  // 特別割当による休暇の割当情報を保持（日付ごとにスタッフ名セット）
  const specialHolidays: { [dateStr: string]: Set<string> } = {};

  console.log(`[generate] dates.length = ${dates.length}`);
  console.log(`[generate] positions.length = ${filteredPositions.length}`);
  console.log(`[generate] staffList.length = ${filteredStaffList.length}`);


  // ──────────────────────────────
  // 各日付に対するスタッフの割当処理
  // ──────────────────────────────
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = formatDateLocal(date);
    // Excel上での日付表示行は、ヘッダー行(A1)の次から開始（2行目以降
    const rowIndex = i + 2;
    worksheet.getCell(`A${rowIndex}`).value = dateStr;
    const day = date.getDay();

    // 当該日の週初（月曜日）を算出する処理
    const currentDate = new Date(date);
    // 日曜日の場合は-6日、それ以外は「1 - 曜日」で週初日との差分を求める
    const diffForMonday = currentDate.getDay() === 0 ? -6 : 1 - currentDate.getDay();
    const weekStartDate = new Date(currentDate);
    weekStartDate.setDate(currentDate.getDate() + diffForMonday);
    const weekStartStr = formatDateLocal(weekStartDate);
    // 週が変わった場合、前週の割当情報を保存し、週割当管理をリセット
    if (weekStartStr !== currentWeekStart) {
      prevWeeklyAssignments = { ...weeklyAssignments };
      weeklyAssignments = {};
      currentWeekStart = weekStartStr;
    }

    // 当日の各種休暇を取得（有休、振休、代休）対象となるスタッフをフィルタリング
    const holidayStaffYukyu = filteredStaffList.filter(
      (s) => s.holidaysYukyu && Array.isArray(s.holidaysYukyu) && s.holidaysYukyu.includes(dateStr)
    );
    const holidayStaffFurikyu = filteredStaffList.filter(
      (s) => s.holidaysFurikyu && Array.isArray(s.holidaysFurikyu) && s.holidaysFurikyu.includes(dateStr)
    );
    const holidayStaffDaikyu = filteredStaffList.filter(
      (s) => s.holidaysDaikyu && Array.isArray(s.holidaysDaikyu) && s.holidaysDaikyu.includes(dateStr)
    );


    // ──────────────────────────────
    // ★【特別割当処理】★
    // ポジションごとにスタッフの特別な割当（特殊フィールドをチェック）を行い、割当済みのスタッフをセットに追加する
    const specialAssigned = new Set<string>();
    const specialAssignedTomorrowOnly = new Set<string>();
    // 当日の割当情報が未定なら初期化
    if (!staffAssignments[dateStr]) {
      staffAssignments[dateStr] = {};
    }
    // 各通常ポジションについて
    for (const pos of normalPositions) {
      if (!staffAssignments[dateStr][pos.id]) {
        staffAssignments[dateStr][pos.id] = [];
      }
      for (const staff of staffList) {
        // 全スタッフについて、ポジション名をキーに動的に保持している特別割当日のフィールドを確認
        const staffIndexable = staff as StaffIndexable;
        const specialField = staffIndexable[pos.name] as string[] | undefined;
        if (Array.isArray(specialField) && specialField.includes(dateStr)) {
          // 既に特別割当済みならスキップ
          if (specialAssigned.has(staff.name)) continue;
          // 当該ポジションへの割当にスタッフ名を追加
          if (!staffAssignments[dateStr][pos.id].includes(staff.name)) {
            staffAssignments[dateStr][pos.id].push(staff.name);
          }
          // 当日と翌日の両方を休みにする場合
          if (pos.horidayToday && pos.horidayTomorrow) {
            if (!specialHolidays[dateStr]) specialHolidays[dateStr] = new Set();
            specialHolidays[dateStr].add(staff.name);
            // 翌営業日にも同じスタッフを特別休暇として割り当てる
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


    // ──────────────────────────────
    // 各休暇ポジションのExcel出力（有休、振休、代休）
    // ──────────────────────────────
    holidayPosYukyu.forEach((pos, j) => {
      const match = pos.outputCell.match(/^([A-Z]+)(\d+)$/);
      if (!match) return;
      const colLetter = match[1];
      const baseRow = parseInt(match[2], 10);
      // 行番号は、ポジションの基準行＋日付のインデックス
      const targetRow = baseRow + 1 + i;
      if (pos.allowMultiple) {
        // 複数配置可能な場合は、全スタッフ名をカンマ区切りで出力
        worksheet.getCell(`${colLetter}${targetRow}`).value =
          holidayStaffYukyu.map((s) => s.name).join(", ");
      } else {
        // 単一配置の場合は、順番に出力（候補がなければ空文字）
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


    // ──────────────────────────────
    // 未割当スタッフの算出
    // ──────────────────────────────
    // まず、フィルター後のスタッフ全員の名前をセットにし、
    // 休暇や特別割当、すでに割り当てられたスタッフを除外
    const unassignedStaff = new Set(filteredStaffList.map((s) => s.name));
    // 休暇（有休、振休、代休）に該当するスタッフを除外
    [...holidayStaffYukyu, ...holidayStaffFurikyu, ...holidayStaffDaikyu].forEach((s) =>
      unassignedStaff.delete(s.name)
    );
    // 特別割当済みのスタッフも除外
    specialAssigned.forEach((name) => unassignedStaff.delete(name));
    // 当日の特別休暇セットに含まれるスタッフも除外
    if (specialHolidays[dateStr]) {
      specialHolidays[dateStr].forEach((name) => unassignedStaff.delete(name));
    }

    
    // ──────────────────────────────
    // 【平日割当のスキップ条件】
    // ──────────────────────────────
    // 当日が土曜日(6)または日曜日(0)または祝日であれば、平日割当処理自体をスキップする
    const holidayFlag = await isJapaneseHoliday(date);
    if (day === 0 || day === 6 || holidayFlag) continue;


    // ──────────────────────────────
    // 【割当再試行ループ】
    // ──────────────────────────────
    // 各ポジションに対して、すべてのスタッフが適切に割り当てられる（利用可能スタッフがいなくなる）まで、最大10回再試行する
    // ここでは、一度現在の割当結果を保存しておき、再試行毎に初期状態にリセットする
    const preservedAssignments: { [posId: string]: string[] } = {};
    // 各ポジションの割当リストをコピー（配列のディープコピー）
    for (const pos of normalPositions) {
      preservedAssignments[pos.id] = staffAssignments[dateStr][pos.id]
        ? [...staffAssignments[dateStr][pos.id]]
        : [];
    }
    const maxRetries = 10;
    let attempt = 0;
    let assignmentValid = false;
    while (attempt < maxRetries && !assignmentValid) {
      // 再試行のたびに、保存した割当結果で初期化する
      for (const pos of normalPositions) {
        staffAssignments[dateStr][pos.id] = [...(preservedAssignments[pos.id] || [])];
      }
      // 利用可能なスタッフのセットを初期化（休暇・特別割当のスタッフは除外）
      const availableStaff = new Set(filteredStaffList.map((s) => s.name));
      [...holidayStaffYukyu, ...holidayStaffFurikyu, ...holidayStaffDaikyu].forEach((s) =>
        availableStaff.delete(s.name)
      );
      if (specialHolidays[dateStr]) {
        specialHolidays[dateStr].forEach((name) => availableStaff.delete(name));
      }
      specialAssigned.forEach((name) => availableStaff.delete(name));

      // 当日の既に割当済みスタッフを記録するセット（重複割当を防ぐため）
      const dailyAssigned = new Set<string>(); // staffSeveral=false 用
      const dailyAssignedSeveral = new Set<string>(); // staffSeveral=true 用

      // ──【④ staffSeveral=true の割当処理】──────────────────────────
      for (const pos of normalPositions) {
        if (pos.dependence && pos.dependence.trim() !== "") continue;
        if (referencedIndependentIds.has(pos.id)) continue;
        if (!pos.staffSeveral) continue;
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
          if (!availableStaff.has(s.name)) return false;
          return true;
        });
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
      }

      // ──【① 依存ポジションの割当処理】──────────────────────────
      // 依存関係があるポジションでは、前営業日の同じ依存先ポジションの最終割当スタッフを流用する
      for (const pos of normalPositions) {
        if (!pos.dependence || pos.dependence.trim() === "") continue;
        const independentPosId = pos.dependence;
        // 前営業日の日付文字列を取得
        const prevBusinessDateStr = await getPreviousBusinessDay(date);
        if (
          !prevBusinessDateStr ||
          !staffAssignments[prevBusinessDateStr] ||
          !staffAssignments[prevBusinessDateStr][independentPosId] ||
          staffAssignments[prevBusinessDateStr][independentPosId].length === 0
        ) {
          // 依存先の割当が無い場合、必須ポジションなら "未配置" を割当
          staffAssignments[dateStr][pos.id].push("未配置");
          continue;
        }
        // 前営業日の依存先ポジションの最終割当スタッフを取得
        const candidateStaff =
          staffAssignments[prevBusinessDateStr][independentPosId][
            staffAssignments[prevBusinessDateStr][independentPosId].length - 1
          ];
        staffAssignments[dateStr][pos.id].push(candidateStaff);
        availableStaff.delete(candidateStaff);
        dailyAssigned.add(candidateStaff);
      }

      // ──【新規ブロックA：週単位固定割当処理（staffSeveral=false, sameStaffWeekly=true）】──────────────────────────
      for (const pos of normalPositions) {
        // 対象は独立（依存がない）で、かつ staffSeveral が false かつ sameStaffWeekly が true
        if (pos.dependence && pos.dependence.trim() !== "") continue;
        if (!pos.sameStaffWeekly) continue;
        if (pos.staffSeveral) continue;
        if (!normalCounts[pos.id]) {
          normalCounts[pos.id] = {};
        }
        let alreadyAssignedName: string | null = null;
        let firstWeekday: Date | null = null;
        const curDate = new Date(date);
        const diff = curDate.getDay() === 0 ? -6 : 1 - curDate.getDay();
        const candidate = new Date(curDate);
        candidate.setDate(curDate.getDate() + diff);
        // 週初から当日までの最初の平日（祝日でない日）を探索
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
            const finalCandidates = availableForPos.filter(
              (sName) => (normalCounts[pos.id][sName] || 0) === minCount
            );
            const chosen = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
            staffAssignments[dateStr][pos.id].push(chosen);
            dailyAssigned.add(chosen);
            availableStaff.delete(chosen);
            normalCounts[pos.id][chosen] = (normalCounts[pos.id][chosen] || 0) + 1;
            if (firstWeekday && formatDateLocal(date) === formatDateLocal(firstWeekday)) {
              const weekKey = `${formatDateLocal(firstWeekday)}_${pos.id}`;
              weeklyAssignments[weekKey] = chosen;
            }
          } else {
            staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
          }
        }
      }

      // ── ②【被依存ポジションの割当処理】 ──
      // 依存されているポジションについて、翌営業日や特別休暇情報を考慮して候補スタッフからランダムに選出
      for (const pos of normalPositions) {
        if (pos.dependence && pos.dependence.trim() !== "") continue; // 既に依存割当済みのものは除外
        if (!referencedIndependentIds.has(pos.id)) continue; // 他から依存されていないポジションは除外
        const nextBusinessDateStr = await getNextBusinessDay(date);
        // 翌営業日の特別休暇情報（上書き管理）
        const specialHolidaysNext =
          nextBusinessDateStr && preCalcSpecialHolidays[nextBusinessDateStr]
            ? preCalcSpecialHolidays[nextBusinessDateStr]
            : new Set<string>();
        // 翌営業日の各種休暇対象スタッフをセット化
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
        // 候補となるスタッフを抽出（availablePositionsに該当ポジションが含まれ、利用可能なスタッフのみ）
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
          // ランダムに候補から1名選出
          const chosen = candidates[Math.floor(Math.random() * candidates.length)];
          staffAssignments[dateStr][pos.id].push(chosen);
          dailyAssigned.add(chosen);
          availableStaff.delete(chosen);
        } else {
          // 候補が無い場合、必須なら "未配置"、任意なら空文字を割当
          staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
        }
      }

      

      // ──【③ 通常ポジション（staffSeveral=false, sameStaffWeekly=false）の割当処理】──────────────────────────
      for (const pos of normalPositions) {
        if (pos.dependence && pos.dependence.trim() !== "") continue;
        // 既に被依存割当対象で処理済み（または週単位固定対象の場合はスキップ）
        if (referencedIndependentIds.has(pos.id)) continue;
        if (pos.sameStaffWeekly) continue;
        if (pos.staffSeveral) continue;
        if (!normalCounts[pos.id]) {
          normalCounts[pos.id] = {};
        }
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
        } else {
          staffAssignments[dateStr][pos.id].push(pos.required ? "未配置" : "");
        }
      }

      

      // ──【未割当スタッフが残っている場合の追加処理】──────────────────────────
        // もし利用可能なスタッフセットにまだ残りがある場合、
        // それらのスタッフについて、担当可能なポジションに再度割当てる処理を行う
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
